import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappClient } from '../whatsapp/whatsapp.client';
import type { Campaign, CampaignStatus, CampaignType, Prisma } from '@prisma/client';

export interface CampaignFilters {
  statuses?: string[];
  cityIds?: string[];
  inactiveSinceDays?: number;
  activeSinceDays?: number;
  minTotalSpent?: number;
  minOrderCount?: number;
  productCategories?: string[];
  vipOnly?: boolean;
}

export interface CreateCampaignInput {
  name: string;
  type?: CampaignType;
  topic?: string;
  message: string;
  messageVariables?: Record<string, unknown>;
  filters?: CampaignFilters;
  status?: CampaignStatus;
  scheduledFor?: string;
  maxMessagesPerCustomer?: number;
  intervalMin?: number;
  onlyWorkHours?: boolean;
  createdById?: string;
}

export interface CampaignListQuery {
  page?: number;
  perPage?: number;
  status?: string;
  type?: string;
}

/**
 * Módulo de campanhas (#34). Segmenta o público a partir dos filtros
 * armazenados, materializa os destinatários em CampaignRecipient e dispara
 * as mensagens via WhatsApp, registrando status individual de cada envio.
 */
@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappClient: WhatsappClient,
  ) {}

  async list(query: CampaignListQuery = {}) {
    const page = Number(query.page ?? 1);
    const perPage = Math.min(Math.max(Number(query.perPage ?? 20), 1), 100);
    const where: Prisma.CampaignWhereInput = {};
    if (query.status) where.status = query.status as never;
    if (query.type) where.type = query.type as never;

    const [total, data] = await this.prisma.$transaction([
      this.prisma.campaign.count({ where }),
      this.prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: { _count: { select: { recipients: true } } },
      }),
    ]);

    return {
      data,
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  async findById(id: string) {
    const campaign = await this.ensureExists(id);
    return { ...campaign, stats: await this.recipientStats(id) };
  }

  async create(input: CreateCampaignInput) {
    if (!input.name?.trim()) throw new BadRequestException('Nome da campanha é obrigatório');
    if (!input.message?.trim()) throw new BadRequestException('Mensagem é obrigatória');
    return this.prisma.campaign.create({
      data: {
        name: input.name,
        type: input.type ?? 'REPOSICAO',
        topic: input.topic,
        message: input.message,
        messageVariables: input.messageVariables as never,
        filters: input.filters as never,
        status: (input.status as Campaign['status'] | undefined) ?? 'DRAFT',
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
        maxMessagesPerCustomer: input.maxMessagesPerCustomer ?? 1,
        intervalMin: input.intervalMin ?? 0,
        onlyWorkHours: input.onlyWorkHours ?? true,
        createdById: input.createdById,
      },
    });
  }

  async update(id: string, input: Partial<CreateCampaignInput>) {
    await this.ensureExists(id);
    const data: Prisma.CampaignUpdateInput = {};
    if (input.name) data.name = input.name;
    if (input.type) data.type = input.type;
    if (input.topic !== undefined) data.topic = input.topic;
    if (input.message !== undefined) data.message = input.message;
    if (input.messageVariables !== undefined) data.messageVariables = input.messageVariables as never;
    if (input.filters !== undefined) data.filters = input.filters as never;
    if (input.status) data.status = input.status as Campaign['status'];
    if (input.scheduledFor !== undefined) data.scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
    if (input.maxMessagesPerCustomer !== undefined) data.maxMessagesPerCustomer = input.maxMessagesPerCustomer;
    if (input.intervalMin !== undefined) data.intervalMin = input.intervalMin;
    if (input.onlyWorkHours !== undefined) data.onlyWorkHours = input.onlyWorkHours;
    return this.prisma.campaign.update({ where: { id }, data });
  }

  async delete(id: string) {
    await this.ensureExists(id);
    await this.prisma.campaignRecipient.deleteMany({ where: { campaignId: id } });
    await this.prisma.campaign.delete({ where: { id } });
    return { ok: true };
  }

  async setStatus(id: string, status: CampaignStatus) {
    await this.ensureExists(id);
    return this.prisma.campaign.update({ where: { id }, data: { status } });
  }

  async stats(id: string) {
    await this.ensureExists(id);
    return this.recipientStats(id);
  }

  /** Resolve o público-alvo segundo os filtros da campanha. */
  async resolveAudience(id: string) {
    const campaign = await this.ensureExists(id);
    const filters = (campaign.filters as CampaignFilters | null) ?? {};
    const where: Prisma.CustomerWhereInput = {};

    if (filters.statuses?.length) where.status = { in: filters.statuses } as never;
    if (filters.cityIds?.length) where.cityId = { in: filters.cityIds };
    if (filters.vipOnly) where.status = 'VIP';
    if (filters.inactiveSinceDays) {
      where.lastPurchaseAt = { lte: new Date(Date.now() - filters.inactiveSinceDays * 86_400_000) };
    }
    if (filters.activeSinceDays) {
      where.lastPurchaseAt = { gte: new Date(Date.now() - filters.activeSinceDays * 86_400_000) };
    }
    if (filters.minTotalSpent !== undefined) where.totalSpent = { gte: filters.minTotalSpent };
    if (filters.minOrderCount !== undefined) where.orderCount = { gte: filters.minOrderCount };
    if (filters.productCategories?.length) {
      where.orders = {
        some: {
          status: { not: 'CANCELADO' },
          items: { some: { product: { category: { name: { in: filters.productCategories } } } } },
        },
      };
    }

    return this.prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        whatsapp: true,
        cityId: true,
        city: { select: { name: true } },
      },
    });
  }

  /** Contagem do público e amostra com a mensagem renderizada (prévia). */
  async preview(id: string, sample = 3) {
    const campaign = await this.ensureExists(id);
    const customers = await this.resolveAudience(id);
    const items = customers.slice(0, sample).map((c) => ({
      customerId: c.id,
      customerName: c.name,
      whatsapp: c.whatsapp,
      city: c.city?.name ?? null,
      message: this.renderMessage(campaign, c),
    }));
    return {
      total: customers.length,
      sample: items,
    };
  }

  /** Materializa os destinatários calculados em CampaignRecipient. */
  async prepare(id: string) {
    const campaign = await this.ensureExists(id);
    const customers = await this.resolveAudience(id);
    const existing = await this.prisma.campaignRecipient.findMany({
      where: { campaignId: id },
      select: { customerId: true },
    });
    const existingIds = new Set(existing.map((r) => r.customerId));
    const rows = customers
      .filter((c) => c.whatsapp && !existingIds.has(c.id))
      .map((c) => ({ campaignId: id, customerId: c.id }));
    let created = 0;
    if (rows.length) {
      const res = await this.prisma.campaignRecipient.createMany({ data: rows, skipDuplicates: true });
      created = res.count;
    }
    return {
      created,
      total: existing.length + created,
      target: customers.length,
      withoutWhatsapp: customers.length - rows.length - existing.length,
    };
  }

  /** Dispara a campanha para os destinatários pendentes, respeitando limites. */
  async send(id: string, limit = 500) {
    const campaign = await this.ensureExists(id);
    if (!this.whatsappClient.enabled) {
      throw new BadRequestException(
        'WhatsApp não configurado. Cadastre EVOLUTION_URL e EVOLUTION_TOKEN para disparar mensagens.',
      );
    }

    await this.prepare(id);
    await this.prisma.campaign.update({ where: { id }, data: { status: 'RUNNING' } });

    const recipients = await this.prisma.campaignRecipient.findMany({
      where: {
        campaignId: id,
        status: { in: ['PENDING', 'FAILED'] },
        customer: { whatsapp: { not: null } },
      },
      include: {
        customer: { select: { id: true, name: true, whatsapp: true, city: { select: { name: true } } } },
      },
      take: Math.min(Math.max(Number(limit) || 500, 1), 2000),
    });

    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      const dest = r.customer.whatsapp;
      if (!dest) continue;
      const text = this.renderMessage(campaign, r.customer);
      try {
        const res = await this.whatsappClient.sendText('default', dest, text);
        if (res.ok) {
          sent++;
          await this.prisma.campaignRecipient.update({
            where: { id: r.id },
            data: { status: 'SENT', contactedAt: new Date() },
          });
          await this.logMessage(r.customer.id, dest, text);
        } else {
          failed++;
          await this.prisma.campaignRecipient.update({
            where: { id: r.id },
            data: { status: 'FAILED', response: res.error },
          });
        }
      } catch (err) {
        failed++;
        await this.prisma.campaignRecipient.update({
          where: { id: r.id },
          data: { status: 'FAILED', response: err instanceof Error ? err.message : String(err) },
        });
      }
      if (campaign.intervalMin && campaign.intervalMin > 0) {
        await new Promise((res) => setTimeout(res, campaign.intervalMin * 60_000));
      }
    }

    const stats = await this.recipientStats(id);
    const remaining = (stats.byStatus.PENDING ?? 0) + (stats.byStatus.FAILED ?? 0);
    if (remaining === 0) {
      await this.prisma.campaign.update({ where: { id }, data: { status: 'FINISHED', sentAt: new Date() } });
    }
    return { ok: true, sent, failed, remaining };
  }

  private async recipientStats(id: string) {
    const [byStatus, total] = await Promise.all([
      this.prisma.campaignRecipient.groupBy({
        by: ['status'],
        where: { campaignId: id },
        _count: { _all: true },
      }),
      this.prisma.campaignRecipient.count({ where: { campaignId: id } }),
    ]);
    const map = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]));
    return { total, byStatus: map, replied: map.REPLIED ?? 0 };
  }

  private renderMessage(
    campaign: Campaign,
    customer: { name?: string | null; city?: { name?: string | null } | null },
  ) {
    const name = customer.name ?? '';
    return (campaign.message ?? '')
      .replaceAll('{{nome}}', name.split(' ')[0] ?? '')
      .replaceAll('{{nome_completo}}', name)
      .replaceAll('{{cidade}}', customer.city?.name ?? '')
      .replaceAll('{{loja}}', 'nossa loja');
  }

  private async logMessage(customerId: string, whatsapp: string, content: string) {
    let conv = await this.prisma.conversation.findFirst({
      where: { customerId, status: { in: ['BOT_ACTIVE', 'HUMAN_ACTIVE', 'WAITING_HUMAN'] } },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    });
    if (conv) {
      await this.prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } });
    } else {
      conv = await this.prisma.conversation.create({
        data: {
          whatsapp,
          customerId,
          status: 'BOT_ACTIVE',
          channel: 'WHATSAPP',
          queue: 'CLIENTES',
          firstMessageAt: new Date(),
          lastMessageAt: new Date(),
        },
        select: { id: true },
      });
    }
    return this.prisma.message.create({
      data: { conversationId: conv.id, direction: 'OUTBOUND', type: 'TEXT', content, sentAt: new Date() },
    });
  }

  private async ensureExists(id: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    return campaign;
  }
}