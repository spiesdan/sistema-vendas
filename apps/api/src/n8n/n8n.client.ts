import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpClient, HttpAdapterOptions } from '../integrations/common/base-http.client';

export interface N8nWorkflowTrigger {
  workflowId: string;
  payload?: Record<string, unknown>;
}

export interface N8nExecution {
  id?: string | number;
  status?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface N8nTriggerResult {
  ok: boolean;
  executionId?: string;
  error?: string;
}

/**
 * N8n Client
 * ---------
 * Camada única de acesso à API N8N. El n8n es la capa de automatización,
 * NO un punto único de fallo: cuando no está disponible el sistema sigue
 * funcionando y los eventos quedan en cola.
 */
@Injectable()
export class N8nClient extends BaseHttpClient {
  private apiToken?: string;
  private webhookSecret?: string;

  constructor(config: ConfigService) {
    super(
      'N8n',
      {
        baseUrl: config.get<string>('N8N_BASE_URL', ''),
        timeoutMs: config.get<number>('N8N_TIMEOUT_MS', 15000),
        maxRetries: config.get<number>('N8N_MAX_RETRIES', 2),
        rateLimitPerMin: config.get<number>('N8N_RATE_LIMIT_PER_MIN', 60),
        headers: {},
      } as HttpAdapterOptions,
    );
    this.apiToken = config.get<string>('N8N_API_KEY');
    this.webhookSecret = config.get<string>('N8N_WEBHOOK_SECRET');
  }

  get enabled(): boolean {
    return Boolean(this.options.baseUrl) && Boolean(this.apiToken);
  }

  get baseUrl(): string {
    return this.options.baseUrl;
  }

  get secret(): string | undefined {
    return this.webhookSecret;
  }

  protected authHeaders(): Record<string, string> {
    return this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {};
  }

  /** Ejecuta un workflow de n8n pasando un payload opcional. */
  async triggerWorkflow(input: N8nWorkflowTrigger): Promise<N8nTriggerResult> {
    if (!this.enabled) {
      return { ok: false, error: 'n8n no está configurado' };
    }
    const res = await this.request<{ id?: string | number }>(
      'POST',
      `workflow/${input.workflowId}/execute`,
      input.payload,
    );
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, executionId: res.data?.id ? String(res.data.id) : undefined };
  }

  /** Consulta el estado de una ejecución concreta. */
  async getExecution(executionId: string): Promise<{ ok: boolean; data?: N8nExecution; error?: string }> {
    if (!this.enabled) return { ok: false, error: 'n8n no está configurado' };
    const res = await this.request<N8nExecution>('GET', `executions/${executionId}`);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, data: res.data };
  }

  /** Reintenta una ejecución fallida. */
  async retryExecution(executionId: string): Promise<N8nTriggerResult> {
    if (!this.enabled) return { ok: false, error: 'n8n no está configurado' };
    const res = await this.request<{ id?: string | number }>(
      'POST',
      `executions/${executionId}/retry`,
    );
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, executionId: res.data?.id ? String(res.data.id) : undefined };
  }
}