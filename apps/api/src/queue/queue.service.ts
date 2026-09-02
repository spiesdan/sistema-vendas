import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type JobsOptions } from 'bullmq';

export const SYNC_QUEUE_NAME = 'comercial-ops-sync';
export const MESSAGING_QUEUE_NAME = 'comercial-ops-messaging';

export interface QueueConnection {
  host: string;
  port: number;
  password?: string;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly connection: QueueConnection;
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Array<{ close: () => Promise<void> }> = [];

  constructor(config: ConfigService) {
    this.connection = {
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
    };
  }

  getConnection() {
    return this.connection;
  }

  isAvailable() {
    return Boolean(this.connection.host && this.connection.port);
  }

  getQueue(name = SYNC_QUEUE_NAME): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.connection });
      this.queues.set(name, q);
    }
    return q;
  }

  async enqueue(name: string, data: unknown, opts?: JobsOptions) {
    if (this.isAvailable()) {
      try {
        return await this.getQueue(name).add(name, data, opts);
      } catch (err) {
        this.logger.warn(`Redis indisponível, execução imediata (${name}). ${err instanceof Error ? err.message : err}`);
        // fallback: processa no mesmo processo
        return undefined;
      }
    }
    return undefined;
  }

  createWorker(name: string, handler: (job: { name: string; data: unknown }) => Promise<void>) {
    const worker = new Worker(name, async (job) => {
      this.logger.log(`Job ${job.name} iniciado (id=${job.id})`);
      await handler({ name: job.name, data: job.data });
      this.logger.log(`Job ${job.name} concluído`);
    }, { connection: this.connection });
    this.workers.push(worker);
    worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.name} falhou: ${err.message}`);
    });
    return worker;
  }

  async onModuleDestroy() {
    for (const queue of this.queues.values()) {
      await queue.close().catch(() => undefined);
    }
    await Promise.all(this.workers.map((w) => w.close().catch(() => undefined)));
  }
}