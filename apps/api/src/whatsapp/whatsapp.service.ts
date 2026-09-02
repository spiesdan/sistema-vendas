import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappClient, WhatsappWebhookEvent } from './whatsapp.client';
import { ChatbotService } from './chatbot.service';
import type { Conversation, Prisma } from '@prisma/client';
import { ConversationStatus } from '@prisma/client';

export interface ConversationListQuery {
  page?: number;
  perPage?: number;
  status?: string;
  search?: string;
  queue?: string;
  assignedUserId?: string;
}

export interface SendMessageInput {
  conversationId: string;
  to: string;
  text: string;
  instanceName?: string;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: WhatsappClient,
    private readonly chatbot: ChatbotService,
  ) {}

  private readonly include = {
    customer: { include: { city: true } },
    assignedUser: true,
    messages: { orderBy: { sentAt: 'desc' as const }, take: 30 },
    orders: { orderBy: { createdAt: 'desc' as const }, take: 5 },
  };

  private normalizePhone(raw: string): string {
    return raw.replace(/\D/g, '');
  }

  async list(query: ConversationListQuery = {}) {
    const page = Number(query.page ?? 1);
    const perPage = Math.min(Math.max(Number(query.perPage ?? 20), 1), 100);
    const where: Prisma.ConversationWhereInput = {};

    if (query.status) where.status = query.status as never;
    if (query.queue) where.queue = query.queue;
    if (query.assignedUserId) where.assignedUserId = query.assignedUserId;
    if (query.search) {
      where.OR = [
        { whatsapp: { contains: query.search } },
        { customer: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        include: this.include,
        orderBy: { lastMessageAt: 'desc' },
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
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: this.include,
    });
    if (!conversation) throw new Error('Conversación no encontrada');
    return conversation;
  }

  async sendMessage(input: SendMessageInput) {
    const conversation = await this.findById(input.conversationId);
    const to = this.normalizePhone(input.to);

    const result = await this.client.sendText(
      input.instanceName ?? 'default',
      to,
      input.text,
    );

    if (!result.ok) {
      this.logger.warn(`Fallo al enviar mensaje: ${result.error}`);
      return { ok: false, error: result.error };
    }

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        type: 'TEXT',
        content: input.text,
        sentAt: new Date(),
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    return { ok: true };
  }

  /**
   * Genera/actualiza una conversación desde un evento de webhook y la
   * procesa con el chatbot (o la deja pendiente para agente humano).
   */
  async handleWebhook(event: WhatsappWebhookEvent) {
    const from = this.normalizePhone(event.from ?? '');
    if (!from) {
      this.logger.warn('Webhook sin remitente, ignorado');
      return { ok: false, error: 'missing from' };
    }

    const content = event.message?.trim() ?? '';
    if (!content) {
      this.logger.warn(`Mensaje vacío de ${from}, ignorado`);
      return { ok: false, error: 'empty message' };
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: { whatsapp: from, status: { in: ['BOT_ACTIVE', 'HUMAN_ACTIVE', 'WAITING_HUMAN'] } },
      orderBy: { lastMessageAt: 'desc' },
    });

    let conv: Conversation;
    if (conversation) {
      conv = await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });
    } else {
      conv = await this.prisma.conversation.create({
        data: {
          whatsapp: from,
          status: 'BOT_ACTIVE',
          channel: 'WHATSAPP',
          queue: 'NOVOS_LEADS',
          firstMessageAt: new Date(),
          lastMessageAt: new Date(),
        },
      });
    }

    await this.prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: 'INBOUND',
        type: this.mapType(event.messageType ?? 'TEXT'),
        content,
        metadata: { source: event.source, webhookId: event.webhookId },
      },
    });

    // Identifica cliente si aún no está ligado
    if (!conv.customerId) {
      const customer = await this.chatbot.identifyCustomer(from);
      if (customer) {
        conv = await this.prisma.conversation.update({
          where: { id: conv.id },
          data: { customerId: customer.id, queue: customer.orderCount ? 'CLIENTES' : 'NOVOS_LEADS' },
        });
      }
    }

    // Última mensagem / enviar resposta
    let reply;
    if (this.chatbotEnabled(conv)) {
      reply = await this.chatbot.respond(conv, content);
      if (reply && reply.text) {
        const sent = await this.client.sendText('default', from, reply.text);
        if (sent.ok) {
          await this.prisma.message.create({
            data: {
              conversationId: conv.id,
              direction: 'OUTBOUND',
              type: 'TEXT',
              content: reply.text,
              sentAt: new Date(),
            },
          });
        }
      }
    }

    return { ok: true, conversationId: conv.id, reply: reply?.text };
  }

  private chatbotEnabled(conv: Conversation): boolean {
    if (!conv.botEnabled) return false;
    if (conv.status === 'HUMAN_ACTIVE') return false;
    if (conv.status === 'WAITING_HUMAN') return false;
    return conv.status === 'BOT_ACTIVE' || conv.status === 'CLOSED';
  }

  private mapType(t: string): 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'LOCATION' | 'CONTACT' | 'BUTTON' | 'ORDER' | 'TEMPLATE' {
    const upper = t.toUpperCase();
    const allowed = new Set(['TEXT', 'IMAGE', 'DOCUMENT', 'AUDIO', 'LOCATION', 'CONTACT', 'BUTTON', 'ORDER', 'TEMPLATE']);
    return allowed.has(upper) ? (upper as never) : 'TEXT';
  }

  async assign(id: string, userId: string) {
    await this.findExisting(id);
    return this.prisma.conversation.update({
      where: { id },
      data: { assignedUserId: userId, status: 'HUMAN_ACTIVE', botEnabled: false },
      include: this.include,
    });
  }

  async close(id: string) {
    await this.findExisting(id);
    return this.prisma.conversation.update({
      where: { id },
      data: { status: 'CLOSED', botEnabled: false },
      include: this.include,
    });
  }

  async reopen(id: string) {
    await this.findExisting(id);
    return this.prisma.conversation.update({
      where: { id },
      data: { status: 'BOT_ACTIVE', botEnabled: true },
      include: this.include,
    });
  }

  /**
   * Handoff: transfere a conversa para um atendente humano e entrega o
   * resumo estruturado do cliente (#16/#22) — histórico, ticket, produtos
   * habituais, carrinho, valor recuperável e abordagem recomendada.
   */
  async handoff(id: string) {
    const conv = await this.findExisting(id);
    const updated = await this.prisma.conversation.update({
      where: { id },
      data: { status: 'WAITING_HUMAN', botEnabled: false },
      include: this.include,
    });
    const context = conv.customerId ? await this.handoffContextByCustomer(conv.customerId, id) : null;
    return { conversation: updated, context };
  }

  async handoffContextForConversation(id: string) {
    const conv = await this.findExisting(id);
    if (!conv.customerId) return null;
    return this.handoffContextByCustomer(conv.customerId, id);
  }

  /** Resumo estruturado para o representante humano (#16). */
  async handoffContextByCustomer(customerId: string, conversationId?: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        city: { select: { name: true, state: true } },
        orders: {
          where: { status: { not: 'CANCELADO' } },
          orderBy: { createdAt: 'desc' as const },
          take: 6,
          include: { items: { include: { product: { select: { id: true, name: true } } } } },
        },
      },
    });
    if (!customer) throw new Error('Cliente não encontrado');

    const productMap = new Map<string, { name: string; quantity: number }>();
    for (const order of customer.orders) {
      for (const item of order.items) {
        const prev = productMap.get(item.product.id);
        productMap.set(item.product.id, {
          name: item.product.name,
          quantity: (prev?.quantity ?? 0) + Number(item.quantity),
        });
      }
    }
    const frequentProducts = [...productMap.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 6);

    const first = customer.orders[customer.orders.length - 1] ?? null;
    const last = customer.orders[0] ?? null;
    let avgIntervalDays: number | null = null;
    if (last && first && customer.orders.length > 1) {
      const spanMs = last.createdAt.getTime() - first.createdAt.getTime();
      avgIntervalDays = Math.max(1, Math.round(spanMs / 86_400_000 / (customer.orders.length - 1)));
    }

    let cart: Array<{ product: string; quantity: number }> = [];
    if (conversationId) {
      const conv = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { metadata: true },
      });
      const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
      const chatbot = (meta.chatbot ?? {}) as Record<string, unknown>;
      const rawCart = Array.isArray(chatbot.cart) ? (chatbot.cart as Array<{ productId: string; quantity: number }>) : [];
      if (rawCart.length) {
        const ids = rawCart.map((i) => i.productId);
        const products = await this.prisma.product.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        });
        const byId = new Map(products.map((p) => [p.id, p.name]));
        cart = rawCart.map((i) => ({ product: byId.get(i.productId) ?? 'Item', quantity: Number(i.quantity) }));
      }
    }

    const lost = await this.prisma.lostSale.aggregate({
      where: { customerId, recovered: false },
      _sum: { value: true },
    });

    const approaches: Record<string, string> = {
      NOVO: 'Cliente novo, ainda no primeiro ciclo. Objetivo: fechar o primeiro pedido com atrito zero.',
      ATIVO: 'Cliente ativo e fiel. Objetivo: ampliar o pedido com base nos itens habituais.',
      VIP: 'Cliente VIP. Atendimento prioritário e consultivo; personalize a oferta.',
      EM_RISCO: 'Consumo em queda. Objetivo: retomar o hábito, relembre a última compra e ofereça um retorno.',
      INATIVO: 'Cliente inativo. Objetivo: reativar com um convite de retorno sem pressão.',
    };

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        whatsapp: customer.whatsapp,
        status: customer.status,
        city: customer.city ? `${customer.city.name}, ${customer.city.state}` : null,
        totalSpent: Number(customer.totalSpent),
        averageTicket: customer.averageTicket ? Number(customer.averageTicket) : null,
        orderCount: customer.orderCount,
        lastPurchaseAt: customer.lastPurchaseAt,
        reorderProbability: customer.reorderProbability,
        avgIntervalDays,
      },
      lastOrder: last
        ? { number: last.number, total: Number(last.total), status: last.status, createdAt: last.createdAt }
        : null,
      frequentProducts,
      cart,
      recoverableValue: Number(lost._sum.value ?? 0),
      recommendedApproach: approaches[customer.status] ?? 'Entenda a necessidade e recomende conforme o histórico.',
    };
  }

  private async findExisting(id: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conv) throw new Error('Conversación no encontrada');
    return conv;
  }
}