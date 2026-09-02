import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Customer, Lead, Prisma } from '@prisma/client';
import { LeadStatus } from '@prisma/client';
import { CustomerIntelligenceService } from '../crm/services/customer-intelligence.service';

export interface CreateLeadInput {
  companyName: string;
  contactName?: string;
  document?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  segment?: string;
  industry?: string;
  potential?: string;
  source?: string;
  cityId?: string;
  regionId?: string;
  salespersonId?: string;
  notes?: string;
}

export interface LeadListQuery {
  page?: number;
  perPage?: number;
  status?: string;
  search?: string;
  cityId?: string;
  regionId?: string;
  salespersonId?: string;
  source?: string;
}

const PIPELINE: LeadStatus[] = ['NOVO', 'CONTATO', 'INTERESSADO', 'NEGOCIACAO', 'PRIMEIRO_PEDIDO', 'CLIENTE_ATIVO'];

/**
 * FASE 5 — Leads: captura, qualificación, pipeline regional.
 * Cada lead avanza por el pipeline; un PRIMEIRO_PEDIDO se convierte en cliente.
 */
@Injectable()
export class LeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligence: CustomerIntelligenceService,
  ) {}

  private readonly include = {
    city: true,
    region: true,
    salesperson: true,
    opportunity: true,
    orders: { orderBy: { createdAt: 'desc' as const }, take: 5 },
  };

  async list(query: LeadListQuery = {}) {
    const page = Number(query.page ?? 1);
    const perPage = Math.min(Math.max(Number(query.perPage ?? 20), 1), 100);
    const where: Prisma.LeadWhereInput = {};

    if (query.status) where.status = query.status as LeadStatus;
    if (query.cityId) where.cityId = query.cityId;
    if (query.regionId) where.regionId = query.regionId;
    if (query.salespersonId) where.salespersonId = query.salespersonId;
    if (query.source) where.source = query.source;
    if (query.search) {
      where.OR = [
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { contactName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        include: this.include,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return {
      data,
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  async findById(id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id }, include: this.include });
    if (!lead) throw new NotFoundException('Lead não encontrado');
    return lead;
  }

  async create(input: CreateLeadInput) {
    if (!input.companyName?.trim()) throw new BadRequestException('Nome da empresa é obrigatório');
    return this.prisma.lead.create({ data: { ...input }, include: this.include });
  }

  async update(id: string, input: Partial<CreateLeadInput>) {
    await this.ensureExists(id);
    return this.prisma.lead.update({ where: { id }, data: { ...input }, include: this.include });
  }

  async delete(id: string) {
    await this.ensureExists(id);
    await this.prisma.lead.delete({ where: { id } });
    return { ok: true };
  }

  /** Avança (ou recua) o lead no pipeline. */
  async moveTo(id: string, nextStatus: LeadStatus) {
    await this.ensureExists(id);
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (nextStatus === 'CLIENTE_ATIVO') {
      return this.convert(id);
    }
    if (nextStatus === 'PERDIDO') {
      if (lead) {
        await this.prisma.lead.update({ where: { id }, data: { status: 'PERDIDO' } });
      }
      return this.findById(id);
    }
    if (!PIPELINE.includes(nextStatus)) {
      throw new BadRequestException(`Estado inválido: ${nextStatus}`);
    }

    const firstContactAt = nextStatus !== 'NOVO' ? (lead?.firstContactAt ?? new Date()) : undefined;
    return this.prisma.lead.update({
      where: { id },
      data: {
        status: nextStatus,
        ...(firstContactAt ? { firstContactAt } : {}),
      },
      include: this.include,
    });
  }

  async assignSalesperson(id: string, salespersonId: string) {
    await this.ensureExists(id);
    return this.prisma.lead.update({
      where: { id },
      data: { salespersonId },
      include: this.include,
    });
  }

  /** Qualificção básica de potencial (A/B/C) por segmento + fonte. */
  qualify(id: string, potential: string) {
    return this.update(id, { potential });
  }

  /** Converte um lead em cliente (PRIMEIRO_PEDIDO / CLIENTE_ATIVO). */
  async convert(id: string): Promise<{ lead: Lead & { customer?: Customer | null }; customer?: Customer }> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead não encontrado');
    if (!lead.companyName) throw new BadRequestException('Lead sem nome de empresa');

    const existing = lead.phone
      ? await this.prisma.customer.findFirst({
          where: {
            OR: [
              { name: lead.companyName },
              ...(lead.phone ? [{ phone: lead.phone }] : []),
              ...(lead.whatsapp ? [{ whatsapp: lead.whatsapp }] : []),
              ...(lead.document ? [{ document: lead.document }] : []),
            ],
          },
        })
      : null;

    let customer: Customer;
    if (existing) {
      customer = existing;
    } else {
      customer = await this.prisma.customer.create({
        data: {
          name: lead.companyName,
          legalName: lead.companyName,
          document: lead.document,
          phone: lead.phone,
          whatsapp: lead.whatsapp,
          email: lead.email,
          cityId: lead.cityId,
          status: 'NOVO',
          salespersonId: lead.salespersonId,
        },
      });
      await this.intelligence.applyClassification(customer.id).catch(() => null);
    }

    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'CLIENTE_ATIVO', convertedAt: new Date() },
      include: this.include,
    });

    return { lead: updated, customer };
  }

  /** Métricas do funil. */
  async funnel() {
    const groups = await this.prisma.lead.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const byRegion = await this.prisma.lead.groupBy({
      by: ['regionId'],
      _count: { _all: true },
      where: { regionId: { not: null } },
    });
    return {
      pipeline: groups.map((g) => ({ status: g.status, count: g._count._all })),
      byRegion,
      total: groups.reduce((acc, g) => acc + g._count._all, 0),
    };
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.lead.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Lead não encontrado');
  }
}