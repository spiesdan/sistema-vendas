import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpClient, HttpAdapterOptions } from '../integrations/common/base-http.client';

export interface WhatsappWebhookEvent {
  webhookId?: string;
  source?: string;
  from?: string;
  message?: string;
  messageType?: string;
  imageUrl?: string;
  voiceUrl?: string;
  location?: { latitude?: number; longitude?: number };
  instanceName?: string;
}

export interface SendMessageResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * Evolution API Adapter
 * --------------------
 * Camada única de acesso à API Evolution (self-hosted). Autenticação via
 * header `apikey`. Los endpoints são configurados via ambiente
 * (EVOLUTION_PATH_*).
 */
@Injectable()
export class WhatsappClient extends BaseHttpClient {
  private readonly paths: Record<string, string> = {};
  private apiToken?: string;

  constructor(config: ConfigService) {
    super(
      'Whatsapp',
      {
        baseUrl: config.get<string>('EVOLUTION_URL', ''),
        timeoutMs: config.get<number>('EVOLUTION_TIMEOUT_MS', 15000),
        maxRetries: config.get<number>('EVOLUTION_MAX_RETRIES', 3),
        rateLimitPerMin: config.get<number>('EVOLUTION_RATE_LIMIT_PER_MIN', 120),
        headers: {},
      } as HttpAdapterOptions,
    );
    this.paths = {
      SEND_TEXT: config.get<string>('EVOLUTION_PATH_SEND_TEXT', ''),
      SEND_IMAGE: config.get<string>('EVOLUTION_PATH_SEND_IMAGE', ''),
    };
    this.apiToken = config.get<string>('EVOLUTION_TOKEN');
  }

  get enabled() {
    return Boolean(this.options.baseUrl && this.apiToken);
  }

  protected authHeaders(): Record<string, string> {
    return { apiKey: this.apiToken ?? '' };
  }

  /** Cambia credencial en runtime (desde pantalla de integración). */
  setCredentials(apiUrl: string, apiToken: string) {
    this.options.baseUrl = apiUrl;
    this.apiToken = apiToken;
  }

  async sendText(instanceName: string, to: string, text: string) {
    const path = this.paths.SEND_TEXT;
    if (!path) {
      return { ok: false as const, status: 0, error: 'Endpoint enviar texto não configurado' };
    }
    const body = { instance: instanceName, to, text, ...(this.options.headers ? {} : {}) };
    const res = await this.request('POST', path, body);
    return { ok: res.ok, status: res.status, error: res.error };
  }

  async sendImage(instanceName: string, to: string, imageUrl: string, caption?: string) {
    const path = this.paths.SEND_IMAGE;
    if (!path) {
      return { ok: false as const, status: 0, error: 'Endpoint enviar imagen no configurado' };
    }
    const body = { instance: instanceName, to, image: imageUrl, caption };
    const res = await this.request('POST', path, body);
    return { ok: res.ok, status: res.status, error: res.error };
  }
}