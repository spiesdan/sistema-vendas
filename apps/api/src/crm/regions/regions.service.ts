import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RegionsService {
  constructor(private readonly prisma: PrismaService) {}

  listRegions() {
    return this.prisma.region.findMany({ include: { cities: true } });
  }

  async listCities(regionId?: string, search?: string) {
    return this.prisma.city.findMany({
      where: {
        ...(regionId ? { regionId } : {}),
        ...(search
          ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { state: { contains: search } }] }
          : {}),
      },
      include: {
        region: true,
        _count: { select: { customers: true, leads: true } },
      },
      orderBy: [{ state: 'asc' }, { name: 'asc' }],
    });
  }

  async upsertRegion(name: string, code?: string) {
    return this.prisma.region.upsert({
      where: { code: code ?? name },
      create: { name, code: code ?? name },
      update: { name },
    });
  }

  async upsertCity(input: {
    name: string;
    state: string;
    regionId?: string;
    latitude?: number;
    longitude?: number;
    potential?: number;
  }) {
    return this.prisma.city.upsert({
      where: { name_state: { name: input.name, state: input.state } },
      create: {
        name: input.name,
        state: input.state,
        regionId: input.regionId,
        latitude: input.latitude ?? 0,
        longitude: input.longitude ?? 0,
        potential: input.potential ?? 0,
      },
      update: {
        regionId: input.regionId ?? undefined,
        latitude: input.latitude ?? undefined,
        longitude: input.longitude ?? undefined,
        potential: input.potential ?? undefined,
      },
    });
  }

  /** Dados para o mapa comercial por cidade. */
  async commercialMap() {
    const cities = await this.prisma.city.findMany({
      include: {
        region: true,
        customers: { select: { id: true, status: true } },
        leads: { select: { status: true } },
        _count: { select: { customers: true, leads: true } },
      },
    });

    const orders = await this.prisma.order.groupBy({
      by: ['customerId'],
      _sum: { total: true },
      where: { status: { in: ['CONFIRMADO', 'ENVIADO_ERP', 'FATURADO'] } },
    });
    const orderTotalByCustomer = new Map(
      orders.map((o) => [o.customerId, o._sum.total ?? 0]),
    );

    return cities.map((city) => {
      const customers = city.customers;
      const active = customers.filter((c) => ['ATIVO', 'NOVO', 'VIP'].includes(c.status)).length;
      const inactive = customers.filter((c) =>
        ['INATIVO', 'EM_RISCO', 'PERDIDO'].includes(c.status),
      ).length;
const revenue = customers.reduce(
        (acc: number, c) => acc + Number(orderTotalByCustomer.get(c.id) ?? 0),
        0,
      );
      return {
        id: city.id,
        name: city.name,
        state: city.state,
        region: city.region?.name ?? null,
        latitude: city.latitude,
        longitude: city.longitude,
        totalCustomers: city._count.customers,
        active,
        inactive,
        leads: city._count.leads,
        revenue,
        potential: city.potential,
      };
    });
  }
}