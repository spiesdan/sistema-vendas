import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../crm/orders/orders.service';
import { CustomersService } from '../crm/customers/customers.service';
import { CustomerIntelligenceService } from '../crm/services/customer-intelligence.service';
import { SyncService } from '../integrations/sync/sync.service';
import type { Conversation, Customer } from '@prisma/client';
import { RecommendationType } from '@prisma/client';

export const CART_TTL_MINUTES = 30;

export interface ChatbotContext {
  cart: Array<{ productId: string; quantity: number }>;
  cartUpdatedAt?: string;
}

export interface ChatbotReply {
  text: string;
  type: 'BOT' | 'HUMAN' | 'ORDER';
  orderId?: string;
}

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  readonly contextKey = 'chatbot';

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly customers: CustomersService,
    private readonly intelligence: CustomerIntelligenceService,
    private readonly sync: SyncService,
  ) {}

  private normalizePhone(raw: string): string {
    return raw.replace(/\D/g, '');
  }

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  private money(n: number) {
    return `R$ ${n.toFixed(2).replace('.', ',')}`;
  }

  private nl(text: string) {
    return `${text}\n`;
  }

  private async loadContext(conversation: Conversation): Promise<ChatbotContext> {
    const meta = (conversation.metadata as Record<string, ChatbotContext> | null) ?? {};
    return {
      cart: meta[this.contextKey]?.cart ?? [],
      cartUpdatedAt: meta[this.contextKey]?.cartUpdatedAt,
    };
  }

  private async saveContext(conversation: Conversation, ctx: ChatbotContext) {
    const meta = (conversation.metadata as Record<string, unknown> | null) ?? {};
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { metadata: { ...meta, [this.contextKey]: ctx } as never },
    });
  }

  private async clearCart(conversation: Conversation) {
    await this.saveContext(conversation, { cart: [], cartUpdatedAt: undefined });
  }

  /**
   * Verifica se o carrinho expirou (TTL). Um carrinho expirado é convertido em
   * uma LostSale (venda recuperável) se houver cliente vinculado.
   */
  async expireCartIfNeeded(conversation: Conversation) {
    const ctx = await this.loadContext(conversation);
    if (!ctx.cart.length || !ctx.cartUpdatedAt) return;

    const updated = new Date(ctx.cartUpdatedAt).getTime();
    const elapsed = Date.now() - updated;
    if (elapsed < CART_TTL_MINUTES * 60_000) return;

    // Carrinho abandonado: registra LostSale vinculada ao cliente, se houver.
    const customerId = conversation.customerId;
    if (customerId) {
      await this.prisma.lostSale.create({
        data: {
          customerId,
          reason: 'DESISTENCIA',
          value: await this.cartValue(conversation),
          recovered: false,
          description: `Carrinho abandonado no WhatsApp (${ctx.cart.length} item(ns))`,
        },
      } as never).catch(() => undefined);
    }
    await this.clearCart(conversation);
  }

  private async cartValue(conversation: Conversation): Promise<number> {
    const ctx = await this.loadContext(conversation);
    if (!ctx.cart.length) return 0;
    const ids = ctx.cart.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: { prices: { where: { active: true, priceTable: { equals: null } }, orderBy: { effectiveFrom: 'desc' }, take: 1 } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return ctx.cart.reduce((acc, item) => {
      const price = byId.get(item.productId)?.prices[0]?.value.toNumber() ?? 0;
      return acc + price * Number(item.quantity);
    }, 0);
  }

  /**
   * Identifica el cliente a partir del teléfono. Si no existe, lo crea como
   * NOVO con solo el teléfono (captación de lead vía WhatsApp).
   */
  async identifyCustomer(whatsapp: string): Promise<Customer | null> {
    const normalized = this.normalizePhone(whatsapp);
    let customer = await this.customers.byWhatsapp(normalized);
    if (!customer) {
      // Intenta por número alternativo (con 9/55 al inicio)
      const alt = normalized.length === 11 && normalized.startsWith('9')
        ? normalized.slice(1)
        : normalized.length === 11 && normalized.startsWith('55')
          ? normalized.slice(2)
          : normalized.length === 10 ? `9${normalized}` : null;
      if (alt) {
        customer = await this.customers.byWhatsapp(alt);
      }
    }
    return customer;
  }

  /**
   * Responde un mensaje entrante. Devuelve el texto y si requiere agente humano.
   */
  async respond(conversation: Conversation, content: string): Promise<ChatbotReply> {
    const text = content.trim();
    await this.expireCartIfNeeded(conversation);
    const ctx = await this.loadContext(conversation);
    const customer = conversation.customerId
      ? await this.customers.findById(conversation.customerId)
      : await this.identifyCustomer(conversation.whatsapp);

    if (!customer) {
      return this.greeting();
    }

    const intent = this.detectIntent(text.toLowerCase());

    // Uso de cifras / cantidad implícita para añadir al carrito
    if (this.isQuantity(text) || (intent === 'BUY' && !ctx.cart.length)) {
      return this.handleBuy(conversation, ctx, customer, text);
    }
    if (intent === 'CATALOG') {
      return this.handleCatalog(customer);
    }
    if (intent === 'CART' || intent === 'CHECKOUT') {
      return this.handleCheckout(conversation, ctx, customer);
    }
    if (intent === 'CLEAR_CART') {
      await this.clearCart(conversation);
      return { text: '🧺 Carrinho limpo. Mande "catálogo" para ver produtos.', type: 'BOT' };
    }
    if (intent === 'HUMAN') {
      await this.escalate(conversation, customer);
      return { text: '👤 Vou transferir sua conversa para um agente humano. Aguarde um momento.', type: 'BOT' };
    }
    if (intent === 'MORE_INFO') {
      await this.escalate(conversation, customer);
      return { text: '👤 Um agente humano vai atender você agora para mais detalhes.', type: 'BOT' };
    }
    if (intent === 'LOST_SALE' && ctx.cart.length) {
      return this.handleLostSale(customer);
    }
    return this.suggestions(customer, ctx);
  }

  private detectIntent(text: string): string {
    if (/(ol[aá]|oi|bom dia|boa tarde|boa noite|e a[ií])/.test(text)) return 'GREETING';
    if (/(pre[cç]o|quanto custa|quanto [eé]|qual o pre[cç]o|valor)/.test(text)) return 'PRICES';
    if (/(cat[aá]logo|produtos|lista|o que vendem|tem|estoque|dispon[ií]veis)/.test(text)) return 'CATALOG';
    if (/(comprar|quero|pedido|encomendar|preciso)/.test(text)) return 'BUY';
    if (/(carrinho|carro|ver pedido|cesta|resumo)/.test(text)) return 'CART';
    if (/(confirmar|finalizar|prosseguir|completar)/.test(text)) return 'CHECKOUT';
    if (/(esvaziar|limpar|remover carrinho|tirar)/.test(text)) return 'CLEAR_CART';
    if (/(agente|atendente|pessoa|humano|representante|assist[iêe]ncia)/.test(text)) return 'HUMAN';
    if (/(info|informa[cç][aã]o|detalhe|mais sobre|ajuda)/.test(text)) return 'MORE_INFO';
    if (/(caro|melhor n[aã]o|sem resposta|n[aã]o me interessa|deixa)/.test(text)) return 'LOST_SALE';
    return 'UNKNOWN';
  }

  private isQuantity(text: string): boolean {
    // "2x [producto]", "quiero 3 de [producto]" o solo un número
    return /^\d+$/u.test(text) || /\dx/u.test(text) || /de [a-záéíóúñ\s]{2,}$/u.test(text);
  }

  private async greeting(): Promise<ChatbotReply> {
    return {
      text:
        this.nl('👋 Olá! Sou o assistente virtual da Comercial Ops 👨‍🚀')
        + '\n'
        + this.nl('') +
        this.nl('Posso ajudar você com:')
        + this.nl('• Catálogo de produtos (escreva "catálogo")')
        + this.nl('• Preços e estoque')
        + this.nl('• Montar seu pedido e confirmá-lo')
        + this.nl('• Falar com um agente humano'),
      type: 'BOT',
    };
  }

  private async suggestions(customer: Customer, ctx: ChatbotContext): Promise<ChatbotReply> {
    const recommendations = await this.prisma.customerRecommendation.findMany({
      where: {
        customerId: customer.id,
        status: 'PENDING',
        product: { active: true },
      },
      include: { product: { include: { prices: { where: { active: true }, orderBy: { effectiveFrom: 'desc' as const } } } } },
      orderBy: { confidence: 'desc' },
      take: 3,
    });

    let text = this.nl('😊 Posso ajudar você com o seguinte:')
      + this.nl('• Mande "catálogo" para ver produtos disponíveis')
      + this.nl('• Escreva a quantidade (ex.: "2x Té París") para adicionar ao carrinho')
      + this.nl('• Mande "confirmar pedido" para finalizar sua compra')
      + this.nl('• Escreva "agente" para falar com um humano');

    if (ctx.cart.length) {
      text += this.nl('') + this.nl(`🛒 Você tem ${ctx.cart.length} item(ns) no carrinho.`);
    }

    if (recommendations.length) {
      text += this.nl('') + this.nl('✨ Eu recomendo:');
      for (const rec of recommendations) {
        const price = rec.product.prices[0]?.value?.toNumber?.() ?? 0;
        text += this.nl(`• ${rec.product.name} — ${this.money(price)}`);
      }
    }

    return { text, type: 'BOT' };
  }

  private async handleCatalog(customer: Customer): Promise<ChatbotReply> {
    const products = await this.prisma.product.findMany({
      where: { active: true, stocks: { some: { quantity: { gt: 0 } } } },
      include: {
        prices: { where: { active: true }, orderBy: { effectiveFrom: 'desc' as const } },
      },
      orderBy: { name: 'asc' },
      take: 10,
    });

    if (!products.length) {
      return { text: '😕 Não há produtos disponíveis no momento.', type: 'BOT' };
    }

    let text = this.nl('📦 Este é o nosso catálogo:') + this.nl('');
    for (const p of products) {
      const price = p.prices[0]?.value?.toNumber?.() ?? 0;
      const stockQty = await this.prisma.stock.aggregate({
        where: { productId: p.id },
        _sum: { quantity: true },
      });
      const available = stockQty._sum.quantity?.toNumber?.() ?? 0;
      text += this.nl(`• ${p.name} (${p.code}) — ${this.money(price)}${available ? '' : ' (sem estoque)'}`);
    }
    text += this.nl('') + 'Mande "2x [nome]" para adicionar ao carrinho.';
    return { text, type: 'BOT' };
  }

  private async handleBuy(
    conversation: Conversation,
    ctx: ChatbotContext,
    customer: Customer,
    text: string,
  ): Promise<ChatbotReply> {
    // `npx <código>` o `n de <nombre>` -> cantidad + término de búsqueda
    const numMatch = text.match(/^\d+/);
    const productMatch = text.match(/(?:de|)\s+([a-záéíóúñ0-9\s-]{2,})$/u);
    let quantity = numMatch ? parseInt(numMatch[0], 10) : 1;
    const search = productMatch?.[1] ? productMatch[1].trim() : null;

    if (!search) {
      // Sem termo: solicita o produto
      return {
        text: this.nl('🤔 Qual produto você quer? Mande por exemplo:')
          + this.nl('• "2x Té París"')
          + this.nl('• "1 de Galletas Integrales"')
          + this.nl('• "catálogo" para ver todos'),
        type: 'BOT',
      };
    }

    const product = await this.prisma.product.findFirst({
      where: {
        active: true,
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      },
      include: {
        prices: { where: { active: true }, orderBy: { effectiveFrom: 'desc' as const } },
      },
    });

    if (!product) {
      return {
        text: this.nl(`😕 Não encontrei "${search}". Mande "catálogo" para ver a lista.`),
        type: 'BOT',
      };
    }

    const stock = await this.prisma.stock.aggregate({
      where: { productId: product.id },
      _sum: { quantity: true },
    });
    const available = stock._sum.quantity?.toNumber?.() ?? 0;
    if (available < quantity) {
      return {
        text: this.nl(`😕 Só há ${available} unidade(s) de ${product.name} em estoque.`),
        type: 'BOT',
      };
    }

    ctx.cart.push({ productId: product.id, quantity });
    ctx.cartUpdatedAt = new Date().toISOString();
    await this.saveContext(conversation, ctx);

    const price = product.prices[0]?.value?.toNumber?.() ?? 0;
    const subtotal = this.round2(price * quantity);
    return {
      text:
        this.nl(`✅ Adicionado: ${quantity}x ${product.name} — ${this.money(subtotal)}`)
        + this.nl('') +
        this.nl('Mande "confirmar pedido" para finalizar, ou continue adicionando.'),
      type: 'BOT',
    };
  }

  private async handleCheckout(
    conversation: Conversation,
    ctx: ChatbotContext,
    customer: Customer,
  ): Promise<ChatbotReply> {
    if (!ctx.cart.length) {
      return {
        text: this.nl('🛒 Seu carrinho está vazio. Mande "catálogo" para adicionar produtos.'),
        type: 'BOT',
      };
    }

    const productIds = ctx.cart.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        prices: { where: { active: true }, orderBy: { effectiveFrom: 'desc' as const } },
      },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    const items: Array<{ productId: string; quantity: number; unitPrice: number }> = [];
    for (const item of ctx.cart) {
      const product = productMap.get(item.productId);
      if (!product) continue;
      const price = product.prices[0]?.value?.toNumber?.() ?? 0;
      items.push({ productId: product.id, quantity: item.quantity, unitPrice: price });
      subtotal = this.round2(subtotal + price * item.quantity);
    }

    const order = await this.orders.create({
      customerId: customer.id,
      source: 'WHATSAPP_AI',
      items,
      conversationId: conversation.id,
    });

    void this.sync.pushOrderToErp(order.id).catch((err) => {
      this.logger.warn(`Erro ao enviar pedido #${order.number} ao ERP: ${err instanceof Error ? err.message : err}`);
    });

    await this.clearCart(conversation);
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        type: 'ORDER',
        content: `Pedido #${order.number} criado`,
        metadata: { orderId: order.id, total: order.total.toNumber() },
      },
    });

    let text =
      this.nl(`✅ Pedido confirmado! #${order.number}`)
      + this.nl(`Total: ${this.money(order.total.toNumber())}`)
      + this.nl('') +
      this.nl('Avisaremos você quando estiver em processo. Obrigado pela compra 🙌');
    return { text, type: 'ORDER', orderId: order.id };
  }

  private async handleLostSale(customer: Customer): Promise<ChatbotReply> {
    await this.prisma.lostSale.create({
      data: {
        customerId: customer.id,
        reason: 'SEM_RESPOSTA',
        description: 'Abandono de carrinho via WhatsApp',
      },
    });
    return {
      text: '😊 Entendo. Se você mudar de ideia, estaremos aqui para ajudar. Posso fazer mais algo?',
      type: 'BOT',
    };
  }

  /** Escala la conversación a un agente humano. */
  async escalate(conversation: Conversation, customer: Customer | null) {
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: 'WAITING_HUMAN',
        botEnabled: false,
        queue: 'CLIENTES',
        ...(conversation.customerId ? {} : customer ? { customerId: customer.id } : {}),
      },
    });
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'SYSTEM',
        type: 'TEXT',
        content: 'Transferido para agente humano',
      },
    });
  }

  /** Recomenda productos para un cliente (cálculo + persistencia). */
  async suggestProducts(customerId: string, take = 3) {
    const orders = await this.prisma.order.findMany({
      where: { customerId },
      include: { items: { include: { product: true } } },
    });
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });

    const usedIds = new Set<string>();

    // Productos más comprados
    const count = new Map<string, { qty: number; name: string; productId: string }>();
    for (const order of orders) {
      for (const item of order.items) {
        const cur = count.get(item.productId);
        if (cur) cur.qty += item.quantity.toNumber();
        else
          count.set(item.productId, {
            qty: item.quantity.toNumber(),
            name: item.product.name,
            productId: item.productId,
          });
      }
    }
    const top = [...count.entries()].sort((a, b) => b[1].qty - a[1].qty).slice(0, take);
    for (const id of count.keys()) usedIds.add(id);

    // Cross-sell: otros productos de las mismas categorías
    const orderedCategoryIds = new Set(
      orders.flatMap((o) => o.items.map((i) => i.product.categoryId)).filter(Boolean),
    );
    const crossSell = await this.prisma.product.findMany({
      where: {
        active: true,
        categoryId: { in: [...orderedCategoryIds] as string[] },
        id: { notIn: [...usedIds] },
      },
      include: { category: true },
      orderBy: { name: 'asc' },
      take,
    });

    const recommendations: Array<{
      productId: string;
      type: RecommendationType;
      reason: string;
      confidence: number;
    }> = [];
    for (const [productId, item] of top) {
      recommendations.push({
        productId,
        type: 'REPOSICAO',
        reason: `Top comprado — ${item.qty} unidad(es)`,
        confidence: Math.min(0.9, 0.3 + item.qty * 0.1),
      });
    }
    for (const product of crossSell) {
      recommendations.push({
        productId: product.id,
        type: 'CROSS_SELL',
        reason: `Complemento en ${product.category?.name ?? 'la misma categoría'}`,
        confidence: 0.5,
      });
    }

    if (recommendations.length) {
      await this.prisma.$transaction(
        recommendations.map((r) =>
          this.prisma.customerRecommendation.create({
            data: { customerId, ...r },
          }),
        ),
      );
    }
    return recommendations.length;
  }

  /** Ejecuta el envío pendiente en la cola (suele venir de automatización). */
  async processSendJob(data: { to: string; text: string }) {
    const customer = await this.identifyCustomer(data.to);
    if (!customer) return;
    const conversation = await this.prisma.conversation.findFirst({
      where: { whatsapp: data.to, status: { in: ['BOT_ACTIVE', 'HUMAN_ACTIVE'] } },
      orderBy: { lastMessageAt: 'desc' },
    });
    if (conversation) {
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'OUTBOUND',
          type: 'TEXT',
          content: data.text,
          sentAt: new Date(),
        },
      });
    }
  }
}