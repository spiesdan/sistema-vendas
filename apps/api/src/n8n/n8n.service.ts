import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { N8nClient, N8nWorkflowTrigger } from './n8n.client';

export interface N8nWebhookEvent {
  secret?: string;
  event?: string;
  payload?: Record<string, unknown>;
}

/**
 * N8nService — puente con n8n. El n8n es una capa de automatización: consume
 * las API internas del sistema y devuelve eventos aquí. El sistema funciona
 * sin n8n (los eventos quedan en cola / registrados localmente).
 */
@Injectable()
export class N8nService {
  private readonly logger = new Logger(N8nService.name);
  // Deduplicación en memoria para eventos sin customer (replay / idempotência).
  private readonly recent: Map<string, number> = new Map();
  private readonly dedupeWindowMs = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: N8nClient,
  ) {}

  async status() {
    return {
      configured: this.client.enabled,
      baseUrl: this.client.enabled ? this.client.baseUrl : null,
      enabled: this.client.enabled,
      // Solo rechazar si el webhook requiere firma (secreto configurado).
      secure: Boolean(this.client.secret),
    };
  }

  async trigger(input: N8nWorkflowTrigger) {
    return this.client.triggerWorkflow(input);
  }

  async getExecution(id: string) {
    return this.client.getExecution(id);
  }

  async retryExecution(id: string) {
    return this.client.retryExecution(id);
  }

  /**
   * Valida firma HMAC-SHA256 sobre el body con timestamp anti-replay.
   * Retorna el body si la firma y la ventana temporal son válidas.
   */
  validateSignature(rawBody: string, signature: string | undefined, timestamp: string | undefined) {
    const secret = this.client.secret;
    if (!secret) return false;
    if (!signature || !timestamp) return false;

    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    // Ventana máxima de 5 minutos contra replay.
    if (Math.abs(Date.now() - ts) > this.dedupeWindowMs) return false;

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    const received = String(signature);
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(received, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  /** Recibe un evento de n8n, valida el secreto y lo registra localmente. */
  async handleWebhook(event: N8nWebhookEvent, rawBody?: string, signature?: string, timestamp?: string) {
    const secret = this.client.secret;

    // Modo seguro: exige firma + timestamp válidos.
    if (secret) {
      if (!rawBody || !this.validateSignature(rawBody, signature, timestamp)) {
        throw new UnauthorizedException('Firma de webhook inválida ou expirada');
      }
    } else if (event.secret !== undefined) {
      // Retrocompat: segredo no body quando configurado sem firma.
      if (event.secret !== secret) {
        throw new UnauthorizedException('Secreto webhook inválido');
      }
    }

    const type = (event.event ?? 'SYSTEM') as string;
    const payload = event.payload ?? {};
    const eventId = typeof payload.eventId === 'string' ? payload.eventId : null;

    // Idempotência: evita processar o mesmo evento duas vezes (replay).
    const dedupeKey = eventId ?? `${type}:${JSON.stringify(payload)}`;
    const hash = crypto.createHash('sha256').update(dedupeKey).digest('hex');
    const now = Date.now();
    if (this.recent.has(hash)) {
      const at = this.recent.get(hash)!;
      if (now - at < this.dedupeWindowMs) {
        return { ok: true, event: type, deduplicated: true };
      }
    }
    this.recent.set(hash, now);
    // Limpeza do cache antigo.
    for (const [k, v] of this.recent) {
      if (now - v > this.dedupeWindowMs) this.recent.delete(k);
    }

    // Registra um CustomerEvent se o evento tiver customerId.
    if (typeof payload.customerId === 'string') {
      await this.prisma.customerEvent.create({
        data: {
          customerId: payload.customerId,
          type: 'SYSTEM',
          title: `Evento n8n: ${type}`,
          description: typeof payload.message === 'string' ? payload.message : undefined,
          metadata: {
            source: 'N8N',
            event: type,
            eventId,
            receivedAt: new Date().toISOString(),
            payload,
          } as never,
        },
      });
    }

    this.logger.log(`Evento n8n recibido: ${type}${eventId ? ` (${eventId})` : ''}`);
    return { ok: true, event: type, deduplicated: false };
  }

  /** Reintenta ejecuciones fallidas de automações. */
  async retryFailedExecutions() {
    const failed = await this.prisma.automationExecution.findMany({
      where: { status: 'FAILED' },
    });
    let retried = 0;
    for (const execution of failed) {
      try {
        const res = await this.client.retryExecution(execution.id);
        if (res.ok) retried++;
        await this.prisma.automationExecution.update({
          where: { id: execution.id },
          data: { status: 'PENDING', finishedAt: null, error: null },
        });
      } catch {
        // segue ao próximo
      }
    }
    return { retried, total: failed.length };
  }
}