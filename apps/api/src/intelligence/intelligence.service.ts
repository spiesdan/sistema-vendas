import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerIntelligenceService } from '../crm/services/customer-intelligence.service';
import type { Prisma, Customer } from '@prisma/client';
import { RecommendationType, RecommendationStatus, LostSaleReason } from '@prisma/client';

const DAY_MS = 86_400_000;

export interface RecomputeOptions {
  customerId?: string;
  limit?: number;
}

export interface NextBestAction {
  type: string;
  customerId: string;
  customerName: string;
  whatsapp: string | null;
  reason: string;
  priority: number;
  expectedValue: number;
  payload?: Record<string, unknown>;
}

export interface AbandonedSale {
  customerId: string;
  customerName: string;
  whatsapp: string | null;
  cityId: string | null;
  formerMonthly: number;
  currentMonthly: number;
  dropPct: number;
  stoppedProducts: Array<{ id: string; name: string; quantity: number }>;
  lastPurchaseAt: Date | null;
}

export interface OpportunitySummary {
  id: string;
  title: string;
  customerId: string | null;
  customerName: string | null;
  value: number;
  status: string;
  source: string | null;
  createdAt: Date;
}

/**
 * Motor de Inteligência Comercial — recompra, riesgo/churn, recomendações,
 * cross-sell, vendas perdidas y "vendas que estamos dejando en la mesa".
 * Reglas explicables (frecuencia histórica, recencia, ticket) — sin ML pesado.
 */
@Injectable()
export class IntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligence: CustomerIntelligenceService,
  ) {}

  private deci(value: { toNumber?: () => number } | null | undefined): number {
    return value?.toNumber ? value.toNumber() : 0;
  }

  private async findCustomer(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        orders: {
          where: { status: { not: 'CANCELADO' } },
          include: { items: { include: { product: true } } },
          orderBy: { createdAt: 'desc' as const },
        },
      },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    return customer;
  }

  /**
   * Recalcula métricas de un cliente: probabilidad de recompra, riesgo de churn,
   * patrón de compra y score persistido (CustomerScore + CustomerPurchasePattern).
   */
  async recalculateMetrics(customerId: string) {
    const customer = await this.findCustomer(customerId);
    const orders = customer.orders;
    const now = new Date();

    if (orders.length === 0) return;

    const firstAt = new Date(Math.min(...orders.map((o) => (o.billedAt ?? o.createdAt).getTime())));
    const lastAt = new Date(Math.max(...orders.map((o) => (o.billedAt ?? o.createdAt).getTime())));
    const daysSinceLast = Math.max(0, Math.floor((now.getTime() - lastAt.getTime()) / DAY_MS));
    const daysSinceFirst = Math.max(1, Math.floor((now.getTime() - firstAt.getTime()) / DAY_MS));

    const count = orders.length;
    const avgInterval =
      count > 1 ? Math.max(1, Math.round(daysSinceFirst / (count - 1))) : 14;

    const totalSpent = orders.reduce((s, o) => s + this.deci(o.total), 0);
    const avgTicket = count > 0 ? totalSpent / count : 0;
    const monthlyAverage = daysSinceFirst > 0 ? totalSpent / (daysSinceFirst / 30) : 0;

    // Probabilidad de recompra: pico cerca del intervalo esperado, decae luego.
    const overdue = Math.max(0, daysSinceLast - avgInterval);
    const reorderProbability = Math.max(0, Math.min(0.95, 1 - overdue / (avgInterval * 1.5)));

    // Riesgo de churn: sube cuando el cliente supera el intervalo esperado.
    const churnRisk = Math.max(0, Math.min(1, Math.min(0.9, overdue / (avgInterval * 2.2))));

    // Patrón: categorías y productos habituales.
    const categoryCounts = new Map<string, { name: string; total: number }>();
    const productCounts = new Map<string, { id: string; name: string; total: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        const prod = item.product;
        if (prod.category && prod.categoryId) {
          const c = categoryCounts.get(prod.categoryId) ?? {
            name: prod.category.name,
            total: 0,
          };
          c.total += this.deci(item.quantity);
          categoryCounts.set(prod.categoryId, c);
        }
        const p = productCounts.get(prod.id) ?? { id: prod.id, name: prod.name, total: 0 };
        p.total += this.deci(item.quantity);
        productCounts.set(prod.id, p);
      }
    }
    const categoryShare = Object.fromEntries(
      Array.from(categoryCounts.entries()).map(([k, v]) => [k, v.total]),
    );
    const productShare = Object.fromEntries(
      Array.from(productCounts.entries()).map(([k, v]) => [k, v.total]),
    );
    const seasonality: Record<string, number> = {};
    for (const order of orders) {
      const key = String(order.createdAt.getMonth() + 1);
      seasonality[key] = (seasonality[key] ?? 0) + 1;
    }

    const expectedNextPurchaseAt = new Date(lastAt.getTime() + avgInterval * DAY_MS);
    const expectedValue = avgTicket;

    // Patrón de compra: recompra o actualiza (aplicando sobre patrón existente).
    const pattern = await this.prisma.customerPurchasePattern.findFirst({
      where: { customerId },
      orderBy: { computedAt: 'desc' },
    });
    const patternInput: Prisma.CustomerPurchasePatternUncheckedCreateInput = {
      customerId,
      avgIntervalDays: avgInterval,
      avgTicket,
      monthlyAverage,
      categoryShare: categoryShare as never,
      productShare: productShare as never,
      churnRisk,
      computedAt: now,
    };

    await this.prisma.$transaction([
      pattern
        ? this.prisma.customerPurchasePattern.update({
            where: { id: pattern.id },
            data: patternInput,
          })
        : this.prisma.customerPurchasePattern.create({
            data: patternInput,
          }),
      this.prisma.customerScore.create({
        data: {
          customerId,
          healthScore: customer.score,
          churnRisk,
          reorderProbability,
          expectedNextPurchaseAt,
          expectedValue,
          factors: { daysSinceLast, avgInterval, orderCount: count, avgTicket, monthlyAverage } as never,
          computedAt: now,
        },
      }),
    ]);

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        reorderProbability,
        churnRisk,
        expectedNextPurchaseAt,
        purchaseFrequency: avgInterval,
        orderCount: count,
        totalSpent,
        averageTicket: avgTicket,
        firstPurchaseAt: firstAt,
        lastPurchaseAt: lastAt,
      },
    });

    // Generar recomendación de recompra cuando hay alta probabilidad.
    if (reorderProbability >= 0.6) {
      await this.generateReorderRecommendation(customer, { productShare, expectedNextPurchaseAt });
    }

    // Evento de oportunidad de recompra.
    if (reorderProbability >= 0.8) {
      await this.prisma.customerEvent.create({
        data: {
          customerId,
          type: 'SYSTEM',
          title: 'Oportunidad de recompra detectada',
          metadata: {
            reorderProbability,
            expectedNextPurchaseAt,
          } as never,
        },
      });
    }

    return {
      customerId,
      avgInterval,
      reorderProbability,
      churnRisk,
      expectedNextPurchaseAt,
      avgTicket,
      monthlyAverage,
    };
  }

  async recalculateAll(options: RecomputeOptions = {}) {
    const where: Prisma.CustomerWhereInput = {
      orderCount: { gt: 0 },
      ...(options.customerId ? { id: options.customerId } : {}),
    };
    const customers = await this.prisma.customer.findMany({
      where,
      take: options.limit ?? 500,
      select: { id: true },
    });
    const results = [];
    for (const c of customers) {
      try {
        results.push(await this.recalculateMetrics(c.id));
      } catch (err) {
        // cliente individual con error no bloquea el resto
        results.push({ customerId: c.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return results;
  }

  private async generateReorderRecommendation(
    customer: Customer,
    ctx: { productShare: Record<string, number>; expectedNextPurchaseAt: Date },
  ) {
    const topProductIds = Object.entries(ctx.productShare)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);
    if (topProductIds.length === 0) return;

    for (const productId of topProductIds) {
      const exists = await this.prisma.customerRecommendation.findFirst({
        where: { customerId: customer.id, productId, status: { in: ['PENDING', 'OFFERED'] } },
      });
      if (exists) continue;
      await this.prisma.customerRecommendation.create({
        data: {
          customerId: customer.id,
          productId,
          type: RecommendationType.REPOSICAO,
          reason: 'Producto habitual por reponer',
          confidence: 0.6,
          status: RecommendationStatus.PENDING,
          createdAt: ctx.expectedNextPurchaseAt,
        },
      });
    }
  }

  /** Recomendaciones activas de un cliente (recompra y cruzadas). */
  async recommendations(customerId: string, productId?: string) {
    const where: Prisma.CustomerRecommendationWhereInput = { customerId };
    if (productId) where.productId = productId;
    return this.prisma.customerRecommendation.findMany({
      where,
      include: { product: true },
      orderBy: { confidence: 'desc' as const },
      take: 50,
    });
  }

  /** Importe de recomendaciones ya ofrecidas a un cliente. */
  async acceptRecommendation(id: string) {
    const rec = await this.prisma.customerRecommendation.findUnique({ where: { id } });
    if (!rec) throw new NotFoundException('Recomendación no encontrada');
    return this.prisma.customerRecommendation.update({
      where: { id },
      data: { status: 'ACCEPTED' },
    });
  }

  /**
   * Cross-sell: productos comprados juntos frecuentemente. Crea recomendación
   * o oportunidad para productos correlacionados no comprados por el cliente.
   */
  async crossSell(customerId: string) {
    const customer = await this.findCustomer(customerId);
    const boughtProductIds = new Set<string>();
    for (const order of customer.orders) {
      for (const item of order.items) boughtProductIds.add(item.productId);
    }
    if (boughtProductIds.size === 0) return { created: 0, recommendations: [] };

    // Co-ocurrencias entre pares de productos comprados en el mismo pedido.
    const cooccurrence = new Map<string, Map<string, number>>();
    const orderByProduct = new Map<string, Set<string>>();
    for (const order of customer.orders) {
      const ids = order.items.map((i) => i.productId);
      for (const a of ids) {
        if (!orderByProduct.has(a)) orderByProduct.set(a, new Set());
        for (const b of ids) if (b !== a) orderByProduct.get(a).add(b);
      }
    }
    for (const [a, setB] of orderByProduct) {
      for (const b of setB) {
        if (!cooccurrence.has(a)) cooccurrence.set(a, new Map());
        cooccurrence.get(a).set(b, (cooccurrence.get(a).get(b) ?? 0) + 1);
      }
    }

    // Top correlaciones por producto comprado por este cliente.
    const candidates = new Map<string, { productId: string; score: number }>();
    for (const a of boughtProductIds) {
      for (const [b, count] of cooccurrence.get(a) ?? []) {
        if (boughtProductIds.has(b)) continue;
        const cur = candidates.get(b);
        if (!cur || count > cur.score) candidates.set(b, { productId: b, score: count });
      }
    }

    const ranked = Array.from(candidates.values())
      .sort((x, y) => y.score - x.score)
      .slice(0, 3);

    const recommendations = [];
    for (const cand of ranked) {
      const createdAt = await this.prisma.customerRecommendation.create({
        data: {
          customerId,
          productId: cand.productId,
          type: RecommendationType.CROSS_SELL,
          reason: 'Productos que suele comprar junto con su mix habitual',
          confidence: Math.min(0.9, 0.4 + cand.score * 0.2),
          status: RecommendationStatus.PENDING,
        },
      });
      recommendations.push(createdAt);
    }
    return { created: recommendations.length, recommendations };
  }

  /** Vendas perdidas de un cliente (filtrables por estado de recuperación). */
  async lostSales(customerId?: string, recovered?: boolean) {
    const where: Prisma.LostSaleWhereInput = {
      ...(customerId ? { customerId } : {}),
      ...(recovered !== undefined ? { recovered } : {}),
    };
    return this.prisma.lostSale.findMany({
      where,
      include: { customer: { select: { id: true, name: true, whatsapp: true } }, order: true },
      orderBy: { createdAt: 'desc' as const },
      take: 100,
    });
  }

  async findByIdLostSale(id: string) {
    const sale = await this.prisma.lostSale.findUnique({
      where: { id },
      include: { customer: true, order: true },
    });
    if (!sale) throw new NotFoundException('Venda perdida no encontrada');
    return sale;
  }

  async createLostSale(input: { orderId?: string; customerId?: string; reason: string; description?: string; value?: number }) {
    if (!input.orderId && !input.customerId) {
      throw new BadRequestException('Se requiere pedido o cliente');
    }
    return this.prisma.lostSale.create({
      data: {
        orderId: input.orderId,
        customerId: input.customerId,
        reason: input.reason as LostSaleReason,
        description: input.description,
        value: input.value,
      },
    });
  }

  /** Marca una venda perdida como recuperada (y crea oportunidad si procede). */
  async recoverLostSale(id: string) {
    const sale = await this.findByIdLostSale(id);
    const updated = await this.prisma.lostSale.update({
      where: { id },
      data: { recovered: true, recoveredAt: new Date() },
    });
    if (sale.customerId) {
      await this.prisma.opportunity.create({
        data: {
          customerId: sale.customerId,
          title: 'Recuperación de venda perdida',
          source: 'RECUPERACION',
          value: sale.value?.toNumber(),
          status: 'ABERTA',
        },
      });
    }
    return updated;
  }

  /** Oportunidades abiertas (para centrar el esfuerzo comercial). */
  async openOpportunities(query: { status?: string; salespersonId?: string; customerId?: string } = {}) {
    const where: Prisma.OpportunityWhereInput = {
      status: (query.status as Prisma.OpportunityWhereInput['status'] | undefined) ?? 'ABERTA',
    };
    if (query.salespersonId) where.assignedUserId = query.salespersonId;
    if (query.customerId) where.customerId = query.customerId;
    const rows = await this.prisma.opportunity.findMany({
      where,
      include: { customer: { select: { id: true, name: true } }, lead: { select: { id: true, companyName: true } } },
      orderBy: { createdAt: 'desc' as const },
      take: 200,
    });
    return rows.map((o) => ({
      id: o.id,
      title: o.title,
      customerId: o.customerId,
      customerName: o.customer?.name ?? o.lead?.companyName ?? null,
      value: this.deci(o.value),
      status: o.status,
      source: o.source,
      createdAt: o.createdAt,
    })) as OpportunitySummary[];
  }

  async createOpportunity(input: { customerId?: string; leadId?: string; title: string; description?: string; value?: number; source?: string; salespersonId?: string }) {
    if (!input.title?.trim()) throw new BadRequestException('Título es obligatorio');
    if (!input.customerId && !input.leadId) throw new BadRequestException('Se requiere cliente o lead');
    return this.prisma.opportunity.create({
      data: {
        customerId: input.customerId,
        leadId: input.leadId,
        title: input.title,
        description: input.description,
        value: input.value,
        source: input.source,
        assignedUserId: input.salespersonId,
      },
    });
  }

  async updateOpportunity(id: string, input: { status?: string; value?: number; assignedUserId?: string }) {
    return this.prisma.opportunity.update({
      where: { id },
      data: {
        ...(input.status ? { status: input.status as never } : {}),
        ...(input.value !== undefined ? { value: input.value } : {}),
        ...(input.assignedUserId !== undefined ? { assignedUserId: input.assignedUserId } : {}),
      },
    });
  }

  /**
   * Next best action global: qué hacer hoy con cada cliente, priorizado.
   * Combina recompra, reactivación, recuperación y cross-sell.
   */
  async nextBestActions(limit = 50) {
    const now = new Date();
    const customers = await this.prisma.customer.findMany({
      where: { status: { in: ['ATIVO', 'EM_RISCO', 'INATIVO', 'PERDIDO', 'OCASIONAL', 'VIP'] }, optOutWhatsapp: false },
      include: {
        opportunities: { where: { status: { in: ['ABERTA', 'EM_NEGOCIACAO'] } }, select: { id: true } },
        lostSales: { where: { recovered: false }, select: { id: true } },
        recommendations: { where: { status: 'PENDING' }, select: { id: true } },
      },
      take: 500,
    });

    const actions: NextBestAction[] = [];
    for (const c of customers) {
      const daysSinceLast = c.lastPurchaseAt
        ? Math.max(0, Math.floor((now.getTime() - c.lastPurchaseAt.getTime()) / DAY_MS))
        : null;
      const avgTicket = this.deci(c.averageTicket);
      const expectedNext = c.expectedNextPurchaseAt;

      if (expectedNext && now.getTime() >= expectedNext.getTime() && c.reorderProbability >= 0.6) {
        actions.push({
          type: 'RECOMPRA',
          customerId: c.id,
          customerName: c.name,
          whatsapp: c.whatsapp,
          reason: 'Próxima compra prevista (probabilidad alta de recompra)',
          priority: 3,
          expectedValue: avgTicket,
          payload: { recommendations: c.recommendations.length },
        });
      }

      if (c.status === 'EM_RISCO' || c.status === 'INATIVO' || c.status === 'PERDIDO') {
        actions.push({
          type: 'REACTIVAR',
          customerId: c.id,
          customerName: c.name,
          whatsapp: c.whatsapp,
          reason: `Cliente sin compra hace ${daysSinceLast ?? '?'} días (${c.status})`,
          priority: daysSinceLast && daysSinceLast >= 90 ? 2 : 4,
          expectedValue: avgTicket,
        });
      }

      if (c.lostSales.length > 0) {
        actions.push({
          type: 'RECUPERAR_VENDA',
          customerId: c.id,
          customerName: c.name,
          whatsapp: c.whatsapp,
          reason: 'Venta perdida pendiente de recuperación',
          priority: 2,
          expectedValue: avgTicket,
          payload: { lostSales: c.lostSales.length },
        });
      }

      if (c.recommendations.length > 0) {
        actions.push({
          type: 'OFERTAR_RECOMENDACION',
          customerId: c.id,
          customerName: c.name,
          whatsapp: c.whatsapp,
          reason: 'Recomendaciones pendientes (cross-sell / recompra)',
          priority: 5,
          expectedValue: avgTicket * 0.5,
          payload: { recommendations: c.recommendations.length },
        });
      }
    }

    actions.sort((a, b) => a.priority - b.priority);
    return actions.slice(0, limit);
  }

  /**
   * "Vendas que estamos deixando en la mesa": clientes cuyo consumo se desplomó.
   * Cruza histórico, frecuencia y mix; identifica productos que dejaron de aparecer.
   */
  async abandonedSales(options: { limit?: number; minDropPct?: number } = {}) {
    const limit = options.limit ?? 50;
    const minDropPct = (options.minDropPct ?? 0.3) / 100;
    const now = new Date();

    const customers = await this.prisma.customer.findMany({
      where: { orderCount: { gt: 0 } },
      include: {
        orders: {
          where: { status: { not: 'CANCELADO' } },
          include: { items: { include: { product: true } } },
          orderBy: { createdAt: 'desc' as const },
        },
        city: { select: { id: true, name: true } },
      },
      take: 1000,
    });

    const results: AbandonedSale[] = [];
    for (const c of customers) {
      const orders = c.orders;
      if (orders.length < 2) continue;
      const cutoff = new Date(now.getTime() - 180 * DAY_MS);
      const recent = orders.filter((o) => (o.billedAt ?? o.createdAt).getTime() >= cutoff.getTime());
      const older = orders.filter((o) => (o.billedAt ?? o.createdAt).getTime() < cutoff.getTime());
      if (recent.length === 0 || older.length === 0) continue;

      const monthly = (orders) => {
        const spanMs = now.getTime() - Math.min(...orders.map((o) => (o.billedAt ?? o.createdAt).getTime()));
        const spanDays = Math.max(2, spanMs / DAY_MS);
        return orders.reduce((s, o) => s + this.deci(o.total), 0) / (spanDays / 30);
      };
      const formerMonthly = monthly(older);
      const currentMonthly = monthly(recent);
      if (formerMonthly <= 0) continue;
      const dropPct = (formerMonthly - currentMonthly) / formerMonthly;
      if (dropPct < minDropPct) continue;

      const olderProductSet = new Map<string, { id: string; name: string; quantity: number }>();
      for (const order of older) {
        for (const item of order.items) {
          const prev = olderProductSet.get(item.productId);
          olderProductSet.set(item.productId, {
            id: item.productId,
            name: item.product.name,
            quantity: (prev?.quantity ?? 0) + this.deci(item.quantity),
          });
        }
      }
      const recentProductIds = new Set<string>();
      for (const order of recent) {
        for (const item of order.items) recentProductIds.add(item.productId);
      }
      const stoppedProducts = Array.from(olderProductSet.values())
        .filter((p) => !recentProductIds.has(p.id))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      results.push({
        customerId: c.id,
        customerName: c.name,
        whatsapp: c.whatsapp,
        cityId: c.cityId,
        formerMonthly: Math.round(formerMonthly * 100) / 100,
        currentMonthly: Math.round(currentMonthly * 100) / 100,
        dropPct: Math.round(dropPct * 100) / 100,
        stoppedProducts,
        lastPurchaseAt: c.lastPurchaseAt,
      });
    }

    results.sort((a, b) => b.dropPct - a.dropPct);
    return results.slice(0, limit);
  }
}