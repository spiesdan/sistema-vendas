import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AppAlert {
  id: string;
  kind: string;
  title: string;
  body: string;
  tone: 'danger' | 'warning' | 'info';
  target: string;
  count: number;
}

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

/**
 * Central de notificações (design #34). Computa alertas em tempo real a
 * partir dos dados operacionais: clientes em risco, conversas aguardando
 * atendente, vendas recuperáveis, leads, estoque crítico e falhas de
 * automação. Não persiste estado: cada leitura reflete o momento atual.
 */
@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [atRisk, waitingHuman, lost, leads, lowStock, automationsFailed] = await Promise.all([
      this.prisma.customer.count({ where: { status: { in: ['EM_RISCO', 'INATIVO'] } } }),
      this.prisma.conversation.count({ where: { status: 'WAITING_HUMAN' } }),
      this.prisma.lostSale.aggregate({ where: { recovered: false }, _sum: { value: true }, _count: { _all: true } }),
      this.prisma.lead.count({ where: { status: { in: ['CONTATO', 'INTERESSADO'] } } }),
      this.prisma.stock.count({ where: { quantity: { lte: 5 } } }),
      this.prisma.automationExecution.count({ where: { status: 'FAILED', triggeredAt: { gte: startOfDay } } }),
    ]);

    const items: AppAlert[] = [];

    if (atRisk > 0) {
      items.push({
        id: 'at-risk',
        kind: 'atrisk',
        title: `${atRisk} ${atRisk === 1 ? 'cliente precisa' : 'clientes precisam'} de contato`,
        body: 'O consumo desacelerou mais que o habitual. Priorize o contato.',
        tone: 'danger',
        target: '/customers',
        count: atRisk,
      });
    }

    if (waitingHuman > 0) {
      items.push({
        id: 'waiting-human',
        kind: 'handoff',
        title: `${waitingHuman} ${waitingHuman === 1 ? 'conversa aguarda' : 'conversas aguardam'} atendente`,
        body: 'Cliente solicitou atendimento humano.',
        tone: 'info',
        target: '/inbox',
        count: waitingHuman,
      });
    }

    const lostValue = Number(lost._sum.value ?? 0);
    if (lostValue > 0) {
      items.push({
        id: 'lost-sales',
        kind: 'lostsales',
        title: `${brl(lostValue)} em vendas recuperáveis`,
        body: `${lost._count._all} ${lost._count._all === 1 ? 'venda perdida aguarda' : 'vendas perdidas aguardam'} recuperação.`,
        tone: 'warning',
        target: '/intelligence',
        count: lost._count._all,
      });
    }

    if (leads > 0) {
      items.push({
        id: 'leads',
        kind: 'leads',
        title: `${leads} ${leads === 1 ? 'lead aguarda' : 'leads aguardam'} avanço`,
        body: 'A velocidade de resposta define a conversão.',
        tone: 'info',
        target: '/leads',
        count: leads,
      });
    }

    if (lowStock > 0) {
      items.push({
        id: 'low-stock',
        kind: 'stock',
        title: `${lowStock} ${lowStock === 1 ? 'produto com' : 'produtos com'} estoque crítico`,
        body: 'Reponha antes que afete as vendas.',
        tone: 'danger',
        target: '/products',
        count: lowStock,
      });
    }

    if (automationsFailed > 0) {
      items.push({
        id: 'automation-failures',
        kind: 'automation',
        title: `${automationsFailed} ${automationsFailed === 1 ? 'automação falhou' : 'automações falharam'} hoje`,
        body: 'Revise as execuções com erro.',
        tone: 'warning',
        target: '/automations',
        count: automationsFailed,
      });
    }

    return { unread: items.length, items };
  }
}