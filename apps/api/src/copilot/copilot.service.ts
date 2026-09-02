import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntelligenceService } from '../intelligence/intelligence.service';

const DAY_MS = 86_400_000;

export interface CopilotOverview {
  toContactToday: Array<{ customerName: string; whatsapp: string | null; action: string; priority: number; expectedValue: number }>;
  atRisk: number;
  dueForReorder: number;
  incomingForecast: number;
  openLostSales: number;
  recoverableValue: number;
  recoveredValue: number;
  leadsPending: number;
  openOpportunities: number;
  message: string;
}

export interface ForecastOutput {
  periodDays: number;
  predictedRevenue: number;
  byWeek: Array<{ start: Date; end: Date; revenue: number; orders: number }>;
  confidence: number;
  assumptions: string[];
}

export interface ContactSlot {
  hour: number;
  dayOfWeek: number;
  activityScore: number;
  count: number;
}

/**
 * IA Comercial Avanzada — copiloto, previsión de ventas/recompra y optimización
 * del mejor momento de contacto. Consulta datos reales; reglas explicables.
 */
@Injectable()
export class CopilotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligence: IntelligenceService,
  ) {}

  private deci(value: { toNumber?: () => number } | null | undefined): number {
    return value?.toNumber ? value.toNumber() : 0;
  }

  /** Resumen ejecutivo: qué hacer hoy, quién está en riesgo, cuánto se recuperó. */
  async overview(): Promise<CopilotOverview> {
    const actions = await this.intelligence.nextBestActions(20);

    const toContactToday = actions.map((a) => ({
      customerName: a.customerName,
      whatsapp: a.whatsapp,
      action: a.type,
      priority: a.priority,
      expectedValue: a.expectedValue,
    }));

    const [atRisk, dueForReorder, openLostSales, recoverableLost, recoveredAmount, leadsPending, openOpps] =
      await this.prisma.$transaction([
        this.prisma.customer.count({
          where: { status: { in: ['EM_RISCO', 'INATIVO', 'PERDIDO'] } },
        }),
        this.prisma.customer.count({
          where: { reorderProbability: { gte: 0.6 }, expectedNextPurchaseAt: { lte: new Date() } },
        }),
        this.prisma.lostSale.count({ where: { recovered: false } }),
        this.prisma.lostSale.aggregate({
          where: { recovered: false },
          _sum: { value: true },
        }),
        this.prisma.lostSale.aggregate({
          where: { recovered: true },
          _sum: { value: true },
        }),
        this.prisma.lead.count({ where: { status: 'NOVO' } }),
        this.prisma.opportunity.count({
          where: { status: { in: ['ABERTA', 'EM_NEGOCIACAO'] } },
        }),
      ]);

    const recoverableValue = this.deci(recoverableLost._sum?.value);
    const recoveredValue = this.deci(recoveredAmount._sum?.value);

    const incomingForecast = await this.forecast({ days: 30 });

    const message =
      actions.length > 0
        ? `Hoy deberías contactar a ${actions.length} clientes. El más urgente es ${toContactToday[0].customerName} (${toContactToday[0].action}).`
        : 'No hay acciones urgentes para hoy.';

    return {
      toContactToday,
      atRisk,
      dueForReorder,
      incomingForecast: incomingForecast.predictedRevenue,
      openLostSales,
      recoverableValue,
      recoveredValue,
      leadsPending,
      openOpportunities: openOpps,
      message,
    };
  }

  /**
   * Previsión de ventas: suma el valor esperado de recompras previstas y
   * oportunidades abiertas en el período, desglosado por semana.
   */
  async forecast(options: { days?: number } = {}): Promise<ForecastOutput> {
    const days = options.days ?? 30;
    const now = new Date();
    const end = new Date(now.getTime() + days * DAY_MS);

    const recompras = await this.prisma.customer.findMany({
      where: { reorderProbability: { gte: 0.6 }, expectedNextPurchaseAt: { gte: now, lte: end } },
      select: { id: true, name: true, expectedNextPurchaseAt: true, averageTicket: true, reorderProbability: true },
    });

    const opps = await this.prisma.opportunity.findMany({
      where: { status: { in: ['ABERTA', 'EM_NEGOCIACAO'] }, expectedCloseAt: { gte: now, lte: end } },
      select: { id: true, value: true, status: true, expectedCloseAt: true },
    });

    const weekly = new Map<number, { start: Date; end: Date; revenue: number; orders: number }>();
    const weekKey = (t: Date) =>
      Math.floor((t.getTime() - now.getTime()) / (7 * DAY_MS));
    const weekBounds = (key: number) => ({
      start: new Date(now.getTime() + key * 7 * DAY_MS),
      end: new Date(now.getTime() + (key + 1) * 7 * DAY_MS),
    });

    let predictedRevenue = 0;
    for (const r of recompras) {
      if (!r.expectedNextPurchaseAt || !r.averageTicket) continue;
      const value = this.deci(r.averageTicket) * r.reorderProbability;
      predictedRevenue += value;
      const key = weekKey(r.expectedNextPurchaseAt);
      if (!weekly.has(key)) weekly.set(key, { ...weekBounds(key), revenue: 0, orders: 0 });
      const w = weekly.get(key) ?? { ...weekBounds(key), revenue: 0, orders: 0 };
      weekly.set(key, w);
      w.revenue += value;
      w.orders += 1;
    }
    for (const o of opps) {
      if (!o.expectedCloseAt) continue;
      const p = o.status === 'EM_NEGOCIACAO' ? 0.5 : 0.3;
      const value = this.deci(o.value) * p;
      predictedRevenue += value;
      const key = weekKey(o.expectedCloseAt);
      if (!weekly.has(key)) weekly.set(key, { ...weekBounds(key), revenue: 0, orders: 0 });
      const w = weekly.get(key) ?? { ...weekBounds(key), revenue: 0, orders: 0 };
      weekly.set(key, w);
      w.revenue += value;
    }

    const byWeek = Array.from(weekly.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => ({
        start: v.start,
        end: v.end,
        revenue: Math.round(v.revenue * 100) / 100,
        orders: v.orders,
      }));

    const coverage = recompras.length + opps.length;
    const confidence = Math.min(0.95, 0.4 + coverage / 100);

    return {
      periodDays: days,
      predictedRevenue: Math.round(predictedRevenue * 100) / 100,
      byWeek,
      confidence,
      assumptions: [
        `Basado en ${recompras.length} recompras previstas y ${opps.length} oportunidades abiertas en ${days} días.`,
        'Recompra: ticket medio × probabilidad de recompra.',
        'Oportunidades: valor × probabilidad de cierre estimada por estado.',
      ],
    };
  }

  /**
   * Mejor momento de contacto: agrupa mensajes y pedidos por hora/día para
   * encontrar la franja con mayor actividad de cada cliente o en general.
   */
  async bestTimeToContact(customerId?: string): Promise<{ general: ContactSlot[]; customer: ContactSlot | null }> {
    const customerFilter = customerId ? { conversation: { customerId } } : undefined;
    const messages = await this.prisma.message.findMany({
      where: { ...customerFilter, direction: 'INBOUND' },
      select: { sentAt: true },
      take: 1000,
    });
    const orders = await this.prisma.order.findMany({
      where: customerId ? { customerId } : undefined,
      select: { createdAt: true },
      take: 1000,
    });

    const score = new Map<number, ContactSlot>();
    const bump = (t: Date, weight: number) => {
      const key = t.getHours() * 7 + t.getDay();
      if (!score.has(key)) {
        score.set(key, { hour: t.getHours(), dayOfWeek: t.getDay(), activityScore: 0, count: 0 });
      }
      const slot = score.get(key) ?? { hour: t.getHours(), dayOfWeek: t.getDay(), activityScore: 0, count: 0 };
      score.set(key, slot);
      slot.activityScore += weight;
      slot.count += 1;
    };
    for (const m of messages) bump(m.sentAt, 1);
    for (const o of orders) bump(o.createdAt, 1.5);

    const general = Array.from(score.values())
      .sort((a, b) => b.activityScore - a.activityScore)
      .slice(0, 10);

    const customer = general.length > 0 ? general[0] : null;
    return { general, customer };
  }

  /** Optimización: cruza sugiere el canal/región con mayor potencial de cierre. */
  async optimization() {
    const byChannel = await this.orderSourceDistribution();
    const byRegion = await this.prisma.$transaction([
      this.prisma.customer.groupBy({
        by: ['cityId'],
        _count: { id: true },
        _sum: { totalSpent: true },
        where: { status: { not: 'PERDIDO' } },
      }),
      this.prisma.lostSale.groupBy({
        by: ['customerId'],
        _sum: { value: true },
        where: { recovered: false },
      }),
    ]);

    return {
      topChannel: byChannel[0],
      channelDistribution: byChannel,
      recommendedCanal: byChannel[0]?.channel,
    };
  }

  private async orderSourceDistribution() {
    const groups = await this.prisma.order.groupBy({
      by: ['source'],
      _count: { id: true },
      _sum: { total: true },
      where: { status: { not: 'CANCELADO' } },
    });
    return groups
      .map((g) => ({
        channel: g.source,
        orders: g._count.id,
        total: this.deci(g._sum.total),
      }))
      .sort((a, b) => b.total - a.total);
  }
}