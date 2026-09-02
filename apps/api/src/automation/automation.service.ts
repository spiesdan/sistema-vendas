import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappClient } from '../whatsapp/whatsapp.client';
import { OrdersService } from '../crm/orders/orders.service';
import { N8nClient } from '../n8n/n8n.client';
import type { Automation, AutomationType, Customer, Prisma } from '@prisma/client';

export interface CreateAutomationInput {
  name: string;
  description?: string;
  type: AutomationType;
  trigger: Record<string, unknown>;
  actions: Record<string, unknown>;
  config?: Record<string, unknown>;
  enabled?: boolean;
  status?: string;
  createdById?: string;
}

export interface AutomationListQuery {
  page?: number;
  perPage?: number;
  type?: string;
  status?: string;
  enabled?: boolean;
}

export interface RunAutomationOptions {
  automationId: string;
  customerId?: string;
  dryRun?: boolean;
}

/**
 * Motor de automações — REPOSICAO / INATIVOS / QUEDA_CONSUMO / RECUPERACION /
 * CROSS_SELL / LEAD_NURTURE / CUSTOM. Funciona sin n8n: cuando n8n no está
 * disponible, la ejecución se hace internamente y queda registrada.
 */
@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappClient: WhatsappClient,
    private readonly orders: OrdersService,
    private readonly n8n: N8nClient,
  ) {}

  async list(query: AutomationListQuery = {}) {
    const page = Number(query.page ?? 1);
    const perPage = Math.min(Math.max(Number(query.perPage ?? 20), 1), 100);
    const where: Prisma.AutomationWhereInput = {};

    if (query.type) where.type = query.type as never;
    if (query.status) where.status = query.status as never;
    if (query.enabled !== undefined) where.enabled = query.enabled;

    const [total, data] = await this.prisma.$transaction([
      this.prisma.automation.count({ where }),
      this.prisma.automation.findMany({
        where,
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
    const automation = await this.prisma.automation.findUnique({
      where: { id },
      include: {
        executions: { orderBy: { triggeredAt: 'desc' as const }, take: 20 },
      },
    });
    if (!automation) throw new NotFoundException('Automação não encontrada');
    return automation;
  }

  async create(input: CreateAutomationInput) {
    if (!input.name?.trim()) throw new BadRequestException('Nome é obrigatório');
    if (!input.trigger || !input.actions) throw new BadRequestException('Trigger e actions são obrigatórios');
    return this.prisma.automation.create({
      data: {
        name: input.name,
        description: input.description,
        type: input.type,
        trigger: input.trigger as never,
        actions: input.actions as never,
        config: input.config as never,
        enabled: input.enabled ?? true,
        status: (input.status as Automation['status'] | undefined) ?? 'DRAFT',
        createdById: input.createdById,
      },
    });
  }

  async update(id: string, input: Partial<CreateAutomationInput>) {
    await this.ensureExists(id);
    const data: Prisma.AutomationUpdateInput = {};
    if (input.name) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.type) data.type = input.type;
    if (input.trigger !== undefined) data.trigger = input.trigger as never;
    if (input.actions !== undefined) data.actions = input.actions as never;
    if (input.config !== undefined) data.config = input.config as never;
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (input.status) data.status = input.status as Automation['status'];
    return this.prisma.automation.update({ where: { id }, data });
  }

  async delete(id: string) {
    await this.ensureExists(id);
    await this.prisma.automation.delete({ where: { id } });
    return { ok: true };
  }

  async setEnabled(id: string, enabled: boolean) {
    await this.ensureExists(id);
    return this.prisma.automation.update({ where: { id }, data: { enabled, status: enabled ? 'ACTIVE' : 'INACTIVE' } });
  }

  /** Encola la ejecución de una automação (Fire-and-forget, resilient). */
  async schedule(input: RunAutomationOptions) {
    await this.ensureExists(input.automationId);
    await this.prisma.automationExecution.create({
      data: {
        automationId: input.automationId,
        customerId: input.customerId,
        status: 'PENDING',
      },
    });
    // Nota: con Redis/BullMQ se enqueue; aqui se ejecuta inline de forma segura.
    return this.run(input.automationId, input.customerId, input.dryRun);
  }

  /** Ejecuta una automação contra un cliente. Devuelve el resultado. */
  async run(automationId: string, customerId?: string, dryRun = false) {
    const automation = await this.findById(automationId);
    if (!automation.enabled || automation.status !== 'ACTIVE') {
      return { ok: false, error: 'Automação inactiva', skipped: true };
    }

    const execution = await this.prisma.automationExecution.create({
      data: {
        automationId,
        customerId,
        status: 'RUNNING',
      },
    });

    try {
      const actions = (automation.actions as Record<string, unknown> | null) ?? {};
      const results: Record<string, unknown> = {};

      if (customerId) {
        const customer = await this.prisma.customer.findUnique({
          where: { id: customerId },
          include: { orders: { include: { items: { include: { product: true } } } } },
        });
        if (!customer) throw new NotFoundException('Cliente não encontrado');

        if (!dryRun) {
          const list = actions.actions as Array<{ type: string; [k: string]: unknown }> | undefined;
          for (const action of list ?? []) {
            const r = await this.executeAction(action, customer);
            results[action.type] = r;
          }
        }
      }

      await this.prisma.automationExecution.update({
        where: { id: execution.id },
        data: { status: 'SUCCESS', finishedAt: new Date(), result: { results, dryRun } },
      });
      return { ok: true, executionId: execution.id, results, dryRun };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.automationExecution.update({
        where: { id: execution.id },
        data: { status: 'FAILED', finishedAt: new Date(), error: msg },
      });
      this.logger.error(`Automação ${automation.name} falhou: ${msg}`);
      return { ok: false, executionId: execution.id, error: msg };
    }
  }

  private async executeAction(action: { type: string; [k: string]: unknown }, customer: Customer) {
    const type = action.type as string;
    switch (type) {
      case 'send_whatsapp':
        return this.sendWhatsapp(customer, String(action.text ?? ''));
      case 'create_order':
        return this.createRecommendationOrder(customer);
      case 'create_opportunity':
        return this.createOpportunity(customer, String(action.title ?? 'Oportunidade automática'));
      case 'handoff':
        return this.handoff(customer);
      case 'trigger_workflow':
        return this.triggerWorkflow(action);
      default:
        return { ok: false, error: `ação desconocida: ${type}` };
    }
  }

  private async sendWhatsapp(customer: Customer, text: string) {
    if (!customer.whatsapp) return { ok: false, error: 'cliente sem whatsapp' };
    if (!this.whatsappClient.enabled) return { ok: false, error: 'whatsapp no configurado' };
    const conv = await this.findOrCreateConversation(customer.id, customer.whatsapp);
    const res = await this.whatsappClient.sendText('default', customer.whatsapp, text);
    if (!res.ok) return { ok: false, error: res.error };
    await this.prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: 'OUTBOUND',
        type: 'TEXT',
        content: text,
        sentAt: new Date(),
      },
    });
    return { ok: true, conversationId: conv.id };
  }

  private async findOrCreateConversation(customerId: string, whatsapp: string) {
    const existing = await this.prisma.conversation.findFirst({
      where: { customerId, status: { in: ['BOT_ACTIVE', 'HUMAN_ACTIVE', 'WAITING_HUMAN'] } },
      orderBy: { lastMessageAt: 'desc' },
    });
    if (existing) return existing;
    return this.prisma.conversation.create({
      data: {
        whatsapp,
        customerId,
        status: 'BOT_ACTIVE',
        channel: 'WHATSAPP',
        queue: 'CLIENTES',
        firstMessageAt: new Date(),
        lastMessageAt: new Date(),
      },
    });
  }

  /** Crea un pedido de recomendación (recompra automática). */
  private async createRecommendationOrder(customer: Customer) {
    const recommendation = await this.prisma.customerRecommendation.findFirst({
      where: { customerId: customer.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!recommendation) return { ok: false, error: 'sin recomendaciones pendientes' };
    const link = await this.findConversationLink(customer.id);
    const order = await this.orders.create(
      {
        customerId: customer.id,
        source: 'WHATSAPP_AI',
        items: [{ productId: recommendation.productId, quantity: 1 }],
        conversationId: link?.id,
        campaignId: link?.campaignId,
        leadId: link?.leadId,
      },
      false,
    );
    await this.prisma.customerRecommendation.update({
      where: { id: recommendation.id },
      data: { status: 'ACCEPTED' },
    });
    return { ok: true, orderId: order.id, number: order.number };
  }

  private async findConversationLink(customerId: string) {
    return this.prisma.conversation.findFirst({
      where: { customerId },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true, campaignId: true, leadId: true },
    });
  }

  private async createOpportunity(customer: Customer, title: string) {
    const opportunity = await this.prisma.opportunity.create({
      data: { customerId: customer.id, title, source: 'AUTOMACAO' },
    });
    return { ok: true, opportunityId: opportunity.id };
  }

  private async handoff(customer: Customer) {
    const conv = await this.prisma.conversation.findFirst({
      where: { customerId, status: { in: ['BOT_ACTIVE', 'WAITING_HUMAN'] } },
      orderBy: { lastMessageAt: 'desc' },
    });
    if (conv) {
      await this.prisma.conversation.update({
        where: { id: conv.id },
        data: { status: 'WAITING_HUMAN', botEnabled: false, queue: 'CLIENTES' },
      });
    }
    return { ok: true, conversationId: conv?.id };
  }

  private async triggerWorkflow(action: { workflowId?: string; [k: string]: unknown }) {
    if (!action.workflowId) return { ok: false, error: 'falta workflowId' };
    return this.n8n.triggerWorkflow({ workflowId: String(action.workflowId) });
  }

  /** Encuentra clientes elegibles según el trigger de la automação. */
  async findCandidates(automationId: string) {
    const automation = await this.prisma.automation.findUnique({ where: { id: automationId } });
    if (!automation) throw new NotFoundException('Automação não encontrada');
    const trigger = (automation.trigger as Record<string, unknown> | null) ?? {}
    const rule = trigger.rule as string | undefined;

    let customers: Customer[];
    if (rule === 'INATIVOS') {
      const days = Number(trigger.days ?? 45);
      const cutoff = new Date(Date.now() - days * 86_400_000);
      customers = await this.prisma.customer.findMany({
        where: { status: { in: ['ATIVO', 'EM_RISCO', 'INATIVO'] }, lastPurchaseAt: { lte: cutoff } },
      });
    } else if (rule === 'REPOSICAO') {
      customers = await this.prisma.customer.findMany({
        where: { status: 'ATIVO', reorderProbability: { gte: 0.6 } },
      });
    } else if (rule === 'QUEDA_CONSUMO') {
      customers = await this.prisma.customer.findMany({
        where: { status: { in: ['NOVO', 'OCASIONAL', 'EM_RISCO'] } },
      });
    } else if (rule === 'LEAD_NURTURE') {
      customers = await this.prisma.customer.findMany({
        where: { status: 'NOVO', createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      });
    } else {
      // CUSTOM: filtros simples opcionales
      const where: Prisma.CustomerWhereInput = {};
      if (trigger.status) where.status = trigger.status as never;
      if (trigger.regionId) where.cityId = trigger.regionId;
      customers = await this.prisma.customer.findMany({ where, take: Number(trigger.limit ?? 100) });
    }

    return customers;
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.automation.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Automação não encontrada');
  }
}