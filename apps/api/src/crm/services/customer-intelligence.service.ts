import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Customer, Order } from '@prisma/client';
import { CustomerStatus } from '@prisma/client';

export interface ClassificationInput {
  customer: Customer;
  orders: Order[];
  now?: Date;
}

export interface ClassificationResult {
  status: CustomerStatus;
  healthScore: number;
  expectedNextPurchaseAt: Date | null;
}

/**
 * Classificação automática de clientes baseada em comportamento real
 * (recência / frequência / valor) — modelo estatístico explicável.
 * Regras configuráveis via tabela Setting (ver SettingsService).
 */
@Injectable()
export class CustomerIntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcula a classificação + health score de um cliente.
   * - NOVO: primeira compra nos últimos 30 dias
   * - ATIVO: dentro do intervalo esperado de recompra
   * - EM_RISCO: ultrapassou ~1.5x o intervalo esperado
   * - INATIVO: passa de X dias (padrão 45)
   * - PERDIDO: passa de 90 dias
   * - OCASIONAL: compra esporádica (frequência alta / poucos pedidos)
   */
  classify(input: ClassificationInput): ClassificationResult {
    const { customer, orders, now = new Date() } = input;
    const nowMs = now.getTime();

    const pricedOrders = orders.filter((o) => o.status !== 'CANCELADO');
    const validOrders = pricedOrders.filter((o) => o.billedAt || o.createdAt);

    if (validOrders.length === 0) {
      return { status: CustomerStatus.NOVO, healthScore: 10, expectedNextPurchaseAt: null };
    }

    const firstAt = new Date(Math.min(...validOrders.map((o) => (o.billedAt ?? o.createdAt).getTime())));
    const lastAt = new Date(Math.max(...validOrders.map((o) => (o.billedAt ?? o.createdAt).getTime())));
    const daysSinceLast = Math.max(0, Math.floor((nowMs - lastAt.getTime()) / 86_400_000));
    const daysSinceFirst = Math.max(1, Math.floor((nowMs - firstAt.getTime()) / 86_400_000));

    const count = validOrders.length;
    const avgInterval =
      count > 1 ? Math.max(1, Math.round(daysSinceFirst / (count - 1))) : 14;

    // Score de saúde: recência, frequência, valor (0-100)
    let healthScore = 50;
    const recencyScore = Math.max(0, 100 - daysSinceLast * 2);
    healthScore += recencyScore * 0.4;

    const freqScore = Math.min(60, (count / Math.max(1, daysSinceFirst / 30)) * 12);
    healthScore += freqScore * 0.4 + (customer.totalSpent ? 10 : 0) * 0.2;
    healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

    // Intervalo esperado de recompra (usado em risco/ativo)
    const expectedAt = new Date(lastAt.getTime() + avgInterval * 86_400_000);

    let status: CustomerStatus;
    if (daysSinceLast <= 30 && count <= 2) {
      status = CustomerStatus.NOVO;
    } else if (daysSinceLast <= avgInterval) {
      status = CustomerStatus.ATIVO;
    } else if (daysSinceLast <= Math.round(avgInterval * 1.5)) {
      status = CustomerStatus.EM_RISCO;
    } else if (count <= 4 && daysSinceLast > avgInterval * 2) {
      status = CustomerStatus.OCASIONAL;
    } else if (daysSinceLast >= 90) {
      status = CustomerStatus.PERDIDO;
    } else if (daysSinceLast >= 45) {
      status = CustomerStatus.INATIVO;
    } else {
      status = CustomerStatus.EM_RISCO;
    }

    // Reforço para VIP
    const monthly = (customer.totalSpent?.toNumber?.() ?? 0) / Math.max(1, daysSinceFirst / 30);
    if (monthly >= 5000 && status === CustomerStatus.ATIVO) {
      status = CustomerStatus.VIP;
      healthScore = Math.min(100, healthScore + 10);
    }

    return {
      status,
      healthScore,
      expectedNextPurchaseAt: status === CustomerStatus.PERDIDO ? null : expectedAt,
    };
  }

  /** Persiste a classificação e event de mudança de status. */
  async applyClassification(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return null;

    const orders = await this.prisma.order.findMany({
      where: { customerId, status: { not: 'CANCELADO' } },
    });

    const result = this.classify({ customer, orders });
    const previousStatus = customer.status;

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        status: result.status,
        score: result.healthScore,
        expectedNextPurchaseAt: result.expectedNextPurchaseAt,
      },
    });

    if (previousStatus !== result.status) {
      await this.prisma.customerEvent.create({
        data: {
          customerId,
          type: 'STATUS_CHANGE',
          title: `Status alterado: ${previousStatus} → ${result.status}`,
          metadata: { previousStatus, newStatus: result.status, score: result.healthScore },
        },
      });
    }

    return result;
  }
}