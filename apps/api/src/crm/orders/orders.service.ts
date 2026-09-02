import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { OrderSource, Prisma } from '@prisma/client';

export interface CreateOrderInput {
  customerId: string;
  source: OrderSource;
  items: Array<{ productId: string; quantity: number; unitPrice?: number; discount?: number }>;
  paymentTerm?: string;
  observations?: string;
  salespersonId?: string;
  conversationId?: string;
  campaignId?: string;
  leadId?: string;
  status?: string;
}

export interface OrderListQuery {
  page?: number;
  perPage?: number;
  status?: string;
  customerId?: string;
  source?: string;
  salespersonId?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    customer: { include: { city: true } },
    items: { include: { product: true } },
    salesperson: true,
  };

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  async list(query: OrderListQuery = {}) {
    const page = Number(query.page ?? 1);
    const perPage = Math.min(Math.max(Number(query.perPage ?? 20), 1), 100);
    const where: Prisma.OrderWhereInput = {};

    if (query.status) where.status = query.status as never;
    if (query.customerId) where.customerId = query.customerId;
    if (query.source) where.source = query.source as never;
    if (query.salespersonId) where.salespersonId = query.salespersonId;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: this.include,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return {
      data: data.map((d) => ({ ...d, total: d.total, subtotal: d.subtotal })),
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  async findById(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: this.include });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    return order;
  }

  async create(input: CreateOrderInput, validate = true) {
    // Valida existência
    const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new BadRequestException('Cliente não encontrado');

    if (input.items.length === 0) throw new BadRequestException('Pedido sem itens');

    // Valida estoque/preço (quando necessário) e coleta preços
    const products = await this.prisma.product.findMany({
      where: { id: { in: input.items.map((i) => i.productId) } },
      include: {
        prices: { where: { active: true }, orderBy: { effectiveFrom: 'desc' } },
        stocks: true,
      },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    let discount = 0;
    const orderItems: Prisma.OrderItemCreateWithoutOrderInput[] = [];

    for (const item of input.items) {
      const product = productMap.get(item.productId);
      if (!product) throw new BadRequestException(`Produto ${item.productId} não encontrado`);

      if (validate) {
        const stockQty = product.stocks.reduce((s, st) => s + st.quantity.toNumber(), 0);
        if (stockQty < item.quantity) {
          throw new BadRequestException(
            `Estoque insuficiente para ${product.name}: disponível ${stockQty}`,
          );
        }
      }

      const unitPrice = this.round2(
        item.unitPrice ?? product.prices[0]?.value?.toNumber() ?? 0,
      );
      if (unitPrice <= 0) {
        throw new BadRequestException(`Sem preço vigente para ${product.name}`);
      }
      const itemDiscount = this.round2(item.discount ?? 0);
      const itemTotal = this.round2(unitPrice * item.quantity - itemDiscount);

      subtotal = this.round2(subtotal + unitPrice * item.quantity);
      discount = this.round2(discount + itemDiscount);

      orderItems.push({
        product: { connect: { id: product.id } },
        quantity: item.quantity,
        unitPrice,
        discount: itemDiscount,
        total: itemTotal,
      });
    }

    const total = this.round2(subtotal - discount);
    const number = await this.nextNumber();

    const order = await this.prisma.order.create({
      data: {
        number,
        customer: { connect: { id: input.customerId } },
        source: input.source,
        status: (input.status as never) ?? 'PENDENTE',
        subtotal,
        discount,
        total,
        paymentTerm: input.paymentTerm,
        observations: input.observations,
        salesperson: input.salespersonId ? { connect: { id: input.salespersonId } } : undefined,
        conversation: input.conversationId ? { connect: { id: input.conversationId } } : undefined,
        campaign: input.campaignId ? { connect: { id: input.campaignId } } : undefined,
        lead: input.leadId ? { connect: { id: input.leadId } } : undefined,
        items: { create: orderItems },
      },
      include: this.include,
    });

    await this.deductStock(orderItems, products);
    await this.registerPurchaseEvent(order.id, input.customerId, total, input.source);

    return order;
  }

  private async nextNumber(): Promise<number> {
    // Número sequencial do dia
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const count = await this.prisma.order.count({
      where: { createdAt: { gte: start } },
    });
    return count + 1;
  }

  private async deductStock(
    items: Prisma.OrderItemCreateWithoutOrderInput[],
    products: Array<{ id: string; name: string; code: string; stocks: { quantity: unknown }[] }>,
  ) {
    for (const item of items) {
      const productId = (item.product.connect as { id: string }).id;
      const qty = item.quantity as number;
      const stocks = await this.prisma.stock.findMany({
        where: { productId, quantity: { gt: 0 } },
        orderBy: { quantity: 'desc' },
      });
      let remaining = qty;
      for (const stock of stocks) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, stock.quantity.toNumber());
        remaining -= take;
        await this.prisma.stock.update({
          where: { id: stock.id },
          data: { quantity: stock.quantity.toNumber() - take },
        });
      }
    }
  }

  private async registerPurchaseEvent(
    orderId: string,
    customerId: string,
    total: number,
    source: string,
  ) {
    await this.prisma.customerEvent.create({
      data: {
        customerId,
        type: 'PURCHASE',
        title: `Pedido ${source} — R$ ${total.toFixed(2)}`,
        description: `Pedido registrado via ${source}`,
        metadata: { orderId, total, source },
      },
    });
  }

  async updateStatus(id: string, status: string) {
    await this.findById(id);
    return this.prisma.order.update({
      where: { id },
      data: { status: status as never },
      include: this.include,
    });
  }

  async markErpSync(id: string, externalId: string, erpStatus?: string) {
    await this.findById(id);
    return this.prisma.order.update({
      where: { id },
      data: {
        externalIdOdvix: externalId,
        erpStatus,
        erpSyncAt: new Date(),
        status: 'ENVIADO_ERP',
      },
      include: this.include,
    });
  }

  async registerLostSale(
    input: {
      customerId?: string;
      orderId?: string;
      reason: string;
      description?: string;
      value?: number;
    },
  ) {
    return this.prisma.lostSale.create({
      data: {
        customer: input.customerId ? { connect: { id: input.customerId } } : undefined,
        order: input.orderId ? { connect: { id: input.orderId } } : undefined,
        reason: input.reason as never,
        description: input.description,
        value: input.value,
      },
    });
  }

  /** Resumo executivo do funil de pedidos (para cards do dashboard). */
  async summary(now = new Date()) {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayRevenue, monthRevenue, todayOrders, monthOrders, openCount, lostSalesValue] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: { createdAt: { gte: startOfDay }, status: { not: 'CANCELADO' } },
          _sum: { total: true },
        }),
        this.prisma.order.aggregate({
          where: { createdAt: { gte: startOfMonth }, status: { not: 'CANCELADO' } },
          _sum: { total: true },
        }),
        this.prisma.order.count({
          where: { createdAt: { gte: startOfDay }, status: { not: 'CANCELADO' } },
        }),
        this.prisma.order.count({
          where: { createdAt: { gte: startOfMonth }, status: { not: 'CANCELADO' } },
        }),
        this.prisma.order.count({ where: { status: { in: ['ORCAMENTO', 'PENDENTE'] } } }),
        this.prisma.lostSale.aggregate({
          where: { recovered: false },
          _sum: { value: true },
        }),
      ]);

    return {
      todayRevenue: todayRevenue._sum.total ?? 0,
      monthRevenue: monthRevenue._sum.total ?? 0,
      todayOrders,
      monthOrders,
      openCount,
      lostSalesValue: lostSalesValue._sum.value ?? 0,
    };
  }
}