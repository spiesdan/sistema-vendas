import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerIntelligenceService } from '../services/customer-intelligence.service';
import type { Prisma } from '@prisma/client';

export interface CustomerListQuery {
  page?: number;
  perPage?: number;
  search?: string;
  status?: string;
  cityId?: string;
  salespersonId?: string;
  segment?: string;
}

export interface CreateCustomerInput {
  name: string;
  legalName?: string;
  document?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  cityId?: string;
  address?: string;
  addressNumber?: string;
  neighborhood?: string;
  zipCode?: string;
  complement?: string;
  salespersonId?: string;
  paymentTerm?: string;
  creditLimitTotal?: number;
  consent?: boolean;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligence: CustomerIntelligenceService,
  ) {}

  private readonly include = {
    city: {
      include: { region: true },
    },
    salesperson: true,
  };

  async list(query: CustomerListQuery = {}) {
    const page = Number(query.page ?? 1);
    const perPage = Math.min(Math.max(Number(query.perPage ?? 20), 1), 100);
    const where: Prisma.CustomerWhereInput = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { document: { contains: query.search } },
        { whatsapp: { contains: query.search } },
      ];
    }
    if (query.status) where.status = query.status as never;
    if (query.cityId) where.cityId = query.cityId;
    if (query.salespersonId) where.salespersonId = query.salespersonId;

    const [total, data] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        include: this.include,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return {
      data,
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    };
  }

  async findById(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id }, include: this.include });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return customer;
  }

  async findAnalyzed(id: string) {
    const customer = await this.findById(id);

    const [orders, events, recentConversations, recommendations] = await Promise.all([
      this.prisma.order.findMany({
        where: { customerId: id },
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.customerEvent.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.conversation.findMany({
        where: { customerId: id },
        include: { messages: { orderBy: { sentAt: 'desc' }, take: 5 } },
        orderBy: { lastMessageAt: 'desc' },
        take: 10,
      }),
      this.prisma.customerRecommendation.findMany({
        where: { customerId: id },
        include: { product: true },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
    ]);

    // produtos mais comprados
    const productCount = new Map<
      string,
      { id: string; name: string; code: string; qty: number }
    >();
    for (const order of orders) {
      for (const item of order.items) {
        const key = item.productId;
        const cur = productCount.get(key);
        if (cur) cur.qty += item.quantity.toNumber();
        else
          productCount.set(key, {
            id: item.product.id,
            name: item.product.name,
            code: item.product.code,
            qty: item.quantity.toNumber(),
          });
      }
    }
    const topProducts = [...productCount.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    return {
      ...(customer as object),
      intelligence: this.intelligence.classify({ customer, orders }),
      metrics: {
        orderCount: customer.orderCount,
        totalSpent: customer.totalSpent,
        averageTicket: customer.averageTicket,
        purchaseFrequencyDays: customer.purchaseFrequency,
        firstPurchaseAt: customer.firstPurchaseAt,
        lastPurchaseAt: customer.lastPurchaseAt,
      },
      topProducts,
      orders,
      events,
      conversations: recentConversations,
      recommendations,
    };
  }

  async create(input: CreateCustomerInput) {
    const data: Prisma.CustomerCreateInput = {
      name: input.name,
      legalName: input.legalName,
      document: input.document,
      email: input.email,
      phone: input.phone,
      whatsapp: input.whatsapp,
      address: input.address,
      addressNumber: input.addressNumber,
      neighborhood: input.neighborhood,
      zipCode: input.zipCode,
      complement: input.complement,
      paymentTerm: input.paymentTerm,
      creditLimitTotal: input.creditLimitTotal,
      city: input.cityId ? { connect: { id: input.cityId } } : undefined,
      salesperson: input.salespersonId ? { connect: { id: input.salespersonId } } : undefined,
      ...(input.consent
        ? { consentAt: new Date(), consentVersion: '1.0' }
        : {}),
    };
    return this.prisma.customer.create({ data, include: this.include });
  }

  async update(id: string, input: Partial<CreateCustomerInput>) {
    await this.findById(id);
    const data: Prisma.CustomerUpdateInput = {
      ...(input.name ? { name: input.name } : {}),
      ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
      ...(input.document !== undefined ? { document: input.document } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.whatsapp !== undefined ? { whatsapp: input.whatsapp } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.addressNumber !== undefined ? { addressNumber: input.addressNumber } : {}),
      ...(input.neighborhood !== undefined ? { neighborhood: input.neighborhood } : {}),
      ...(input.zipCode !== undefined ? { zipCode: input.zipCode } : {}),
      ...(input.complement !== undefined ? { complement: input.complement } : {}),
      ...(input.paymentTerm !== undefined ? { paymentTerm: input.paymentTerm } : {}),
      ...(input.creditLimitTotal !== undefined ? { creditLimitTotal: input.creditLimitTotal } : {}),
      ...(input.cityId ? { city: { connect: { id: input.cityId } } } : {}),
      ...(input.salespersonId !== undefined
        ? { salesperson: input.salespersonId ? { connect: { id: input.salespersonId } } : { disconnect: true } }
        : {}),
    };
    return this.prisma.customer.update({ where: { id }, data, include: this.include });
  }

  /** Atualiza métricas calculadas a partir de pedidos (após criar/alterar pedido). */
  async recomputeMetrics(customerId: string) {
    const orders = await this.prisma.order.findMany({
      where: { customerId, status: { not: 'CANCELADO' } },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });

    const totalSpent = orders.reduce((acc, o) => acc + o.total.toNumber(), 0);
    const orderCount = orders.length;
    const averageTicket = orderCount ? totalSpent / orderCount : 0;
    const firstPurchaseAt = orders[0]?.createdAt ?? null;
    const lastPurchaseAt = orders.length ? orders[orders.length - 1].createdAt : null;

    let purchaseFrequency = 0;
    if (orders.length >= 2) {
      const first = orders[0].createdAt.getTime();
      const last = orders[orders.length - 1].createdAt.getTime();
      purchaseFrequency = Math.max(1, Math.round((last - first) / 86_400_000 / (orders.length - 1)));
    }

    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        totalSpent,
        orderCount,
        averageTicket,
        firstPurchaseAt,
        lastPurchaseAt,
        purchaseFrequency,
      },
    });

    await this.intelligence.applyClassification(customerId);
    return customer;
  }

  async byWhatsapp(whatsapp: string) {
    return this.prisma.customer.findUnique({ where: { whatsapp } });
  }

  /** Clientes com coordenadas geográficas para o mapa interativo. */
  async mapData() {
    const customers = await this.prisma.customer.findMany({
      where: { city: { latitude: { not: null }, longitude: { not: null } } },
      include: { city: true },
      orderBy: { totalSpent: 'desc' },
    });

    return customers.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      tier: c.tier,
      whatsapp: c.whatsapp,
      totalSpent: c.totalSpent.toNumber(),
      orderCount: c.orderCount,
      score: c.score,
      lastPurchaseAt: c.lastPurchaseAt,
      city: c.city?.name ?? null,
      state: c.city?.state ?? null,
      latitude: c.city?.latitude ?? null,
      longitude: c.city?.longitude ?? null,
    }));
  }
}