import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface HttpAdapterOptions {
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  rateLimitPerMin: number;
  headers: Record<string, string>;
}

export interface IntegrationHttpResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  retries: number;
  durationMs: number;
}

export interface IntegrationHttpClient {
  request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
  ): Promise<IntegrationHttpResult<T>>;
}

/**
 * Cliente HTTP genérico para integrações com:
 * retry com backoff, timeout, rate limit simples e logging.
 */
@Injectable()
export abstract class BaseHttpClient implements IntegrationHttpClient {
  protected readonly logger: Logger;
  private requestsThisMinute: number[] = [];

  constructor(
    name: string,
    protected readonly options: HttpAdapterOptions,
  ) {
    this.logger = new Logger(`${name}HttpClient`);
  }

  protected abstract authHeaders(): Record<string, string>;

  private wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async throttle() {
    const now = Date.now();
    this.requestsThisMinute = this.requestsThisMinute.filter((t) => now - t < 60_000);
    if (this.requestsThisMinute.length >= this.options.rateLimitPerMin) {
      const oldest = Math.min(...this.requestsThisMinute);
      const waitMs = 60_000 - (now - oldest);
      this.logger.warn(`Rate limit: aguardando ${Math.ceil(waitMs / 1000)}s`);
      await this.wait(waitMs);
    }
    this.requestsThisMinute.push(Date.now());
  }

  async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
  ): Promise<IntegrationHttpResult<T>> {
    const start = Date.now();
    let lastError: string | null = null;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      await this.throttle();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
      try {
        const queryString = query
          ? '?' + new URLSearchParams(query as Record<string, string>).toString()
          : '';
        const url = this.joinUrl(this.options.baseUrl, path) + queryString;
        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...this.authHeaders(),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        const text = await res.text();
        let json: T | undefined;
        try {
          json = text ? JSON.parse(text) : undefined;
        } catch {
          json = undefined;
        }

        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('retry-after') ?? '2');
          this.logger.warn(`HTTP 429 — Retry-After ${retryAfter}s (tentativa ${attempt})`);
          clearTimeout(timer);
          lastError = `HTTP 429 rate limit`;
          await this.wait(retryAfter * 1000);
          continue; // retry
        }

        if (!res.ok) {
          const errBody = JSON.stringify(json ?? text).slice(0, 500);
          this.logger.error(`[${method}] ${path} -> ${res.status}: ${errBody}`);
          clearTimeout(timer);
          return {
            ok: false,
            status: res.status,
            error: errBody,
            retries: attempt,
            durationMs: Date.now() - start,
          };
        }

        clearTimeout(timer);
        this.logger.debug(`[${method}] ${path} -> ${res.status} (${Date.now() - start}ms)`);
        return {
          ok: true,
          status: res.status,
          data: json,
          retries: attempt,
          durationMs: Date.now() - start,
        };
      } catch (err) {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : String(err);
        lastError = msg;
        this.logger.error(`[${method}] ${path} erro: ${msg} (tentativa ${attempt})`);
        if (attempt < this.options.maxRetries) {
          const backoff = 1000 * Math.pow(2, attempt) + Math.random() * 200;
          await this.wait(backoff);
        }
      }
    }

    return {
      ok: false,
      status: 0,
      error: lastError ?? 'unknown',
      retries: this.options.maxRetries,
      durationMs: Date.now() - start,
    };
  }

  private joinUrl(base: string, path: string) {
    return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
  }
}