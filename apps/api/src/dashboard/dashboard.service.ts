import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerIntelligenceService } from '../crm/services/customer-intelligence.service';

export interface DashboardOverview {
  cards: {
    todayRevenue: number;
    monthRevenue: number;
    todayOrders: number;
    averageTicket: number;
    activeCustomers: number;
    newCustomers: number;
    atRiskCustomers: number;
    inactiveCustomers: number;
    leads: number;
    vipCustomers: number;
    lowStockCount: number;
    lostSalesValue: number;
    openOpportunities: number;
    digitalOrders: number;
    activeAutomations: number;
  };
  byStatus: Array<{ status: string; count: number }>;
  byCity: Array<{ city: string | null; state: string; customers: number; revenue: number }>;
  lastOrders: Array<{
    id: string;
    number: number | null;
    customerName: string;
    total: number;
    status: string;
    source: string;
    createdAt: Date;
  }>;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligence: CustomerIntelligenceService,
  ) {}

  async overview(): Promise<DashboardOverview> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [orders, customersByStatus, cities, lastOrders, leads, lowStock, lostSales, opportunities, stats, digitalOrders, activeAutomations] =
      await Promise.all([
        this.prisma.order.findMany({
          where: { createdAt: { gte: startOfMonth }, status: { not: 'CANCELADO' } },
          include: { customer: { select: { name: true, cityId: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.customer.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.citiesRevenue(),
        this.prisma.order.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { customer: { select: { name: true } } },
        }),
        this.prisma.lead.count(),
        this.prisma.stock.count({ where: { quantity: { lte: 5 } } }),
        this.prisma.lostSale.aggregate({
          where: { recovered: false },
          _sum: { value: true },
        }),
        this.prisma.opportunity.count({ where: { status: { in: ['ABERTA', 'EM_NEGOCIACAO'] } } }),
        this.prisma.customer.aggregate({
          _sum: { totalSpent: true },
          _count: { _all: true },
          _avg: { averageTicket: true },
        }),
        this.prisma.order.count({
          where: {
            createdAt: { gte: startOfMonth },
            status: { not: 'CANCELADO' },
            source: { in: ['WHATSAPP_AI', 'WHATSAPP_HUMAN', 'WEB', 'CAMPAIGN'] },
          },
        }),
        this.prisma.automation.count({ where: { enabled: true } }),
      ]);

    const monthRevenue = orders.reduce((s, o) => s + o.total.toNumber(), 0);
    const todayRevenue = orders
      .filter((o) => o.createdAt >= startOfDay)
      .reduce((s, o) => s + o.total.toNumber(), 0);
    const todayOrders = orders.filter((o) => o.createdAt >= startOfDay).length;
    const statusMap = (status: string) =>
      customersByStatus.find((c) => c.status === status)?._count._all ?? 0;

    const newCustomers = await this.prisma.customer.count({
      where: { createdAt: { gte: startOfMonth } },
    });

    return {
      cards: {
        todayRevenue,
        monthRevenue,
        todayOrders,
        averageTicket: Number(stats._avg.averageTicket ?? 0),
        activeCustomers: statusMap('ATIVO') + statusMap('VIP') + statusMap('NOVO'),
        newCustomers,
        atRiskCustomers: statusMap('EM_RISCO'),
        inactiveCustomers: statusMap('INATIVO'),
        leads,
        vipCustomers: statusMap('VIP'),
        lowStockCount: lowStock,
        lostSalesValue: Number(lostSales._sum.value ?? 0),
        openOpportunities: opportunities,
        digitalOrders,
        activeAutomations,
      },
      byStatus: customersByStatus.map((c) => ({ status: c.status, count: c._count._all })),
      byCity: cities,
      lastOrders: lastOrders.map((o) => ({
        id: o.id,
        number: o.number,
        customerName: o.customer.name,
        total: o.total.toNumber(),
        status: o.status,
        source: o.source,
        createdAt: o.createdAt,
      })),
    };
  }

  private async citiesRevenue() {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: ['CONFIRMADO', 'ENVIADO_ERP', 'FATURADO'] } },
      include: { customer: { select: { cityId: true, city: { select: { name: true, state: true } } } } },
    });
    const map = new Map<string, { city: string | null; state: string; customers: Set<string>; revenue: number }>();
    for (const o of orders) {
      const cust = o.customer;
      const city = cust.city?.name ?? null;
      const state = cust.city?.state ?? '';
      const key = `${city ?? ''}|${state}`;
      const entry = map.get(key) ?? { city, state, customers: new Set<string>(), revenue: 0 };
      entry.customers.add(cust.cityId ?? '');
      entry.revenue += o.total.toNumber();
      map.set(key, entry);
    }
    return [...map.values()].map((e) => ({
      city: e.city,
      state: e.state,
      customers: e.customers.size,
      revenue: Math.round(e.revenue * 100) / 100,
    }));
  }

  /** Módulo "O que preciso fazer hoje" para representante (FASE 25). */
  async representativeDaily(salespersonId?: string) {
    const where =
      salespersonId ? { salespersonId } : {};
    const [atRisk, negotiations, opportunities, highPotentialLeads, problemOrders, vipNeedingContact] =
      await Promise.all([
        this.prisma.customer.count({ where: { ...where, status: { in: ['EM_RISCO', 'INATIVO'] } } }),
        this.prisma.opportunity.count({ where: { status: 'EM_NEGOCIACAO', assignedUserId: { not: null } } }),
        this.prisma.opportunity.count({ where: { status: { in: ['ABERTA', 'EM_NEGOCIACAO'] } } }),
        this.prisma.lead.count({ where: { status: { in: ['CONTATO', 'INTERESSADO'] }, ...where } }),
        this.prisma.order.count({ where: { status: 'PROBLEMA', ...where } }),
        this.prisma.customer.count({
          where: { ...where, status: 'VIP', lastPurchaseAt: { lt: new Date(Date.now() - 14 * 86_400_000) } },
        }),
      ]);
    const dueCustomers = await this.prisma.customer.findMany({
      where: { ...where, status: { in: ['EM_RISCO', 'INATIVO'] } },
      select: { id: true, name: true, status: true, city: { select: { name: true } }, lastPurchaseAt: true },
      take: 20,
    });
    return {
      counts: {
        atRisk,
        negotiations,
        opportunities,
        highPotentialLeads,
        problemOrders,
        vipNeedingContact,
      },
      dueCustomers,
    };
  }
}