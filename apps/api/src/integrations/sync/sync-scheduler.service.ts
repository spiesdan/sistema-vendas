import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SyncService } from './sync.service';
import { QueueService, SYNC_QUEUE_NAME } from '../../queue/queue.service';

/**
 * Sincronização periódica + reclassificação de clientes.
 * Modo BullMQ: produz jobs 'run-sync' / 'reclassify' na fila e o worker consome.
 * Modo fallback (sem Redis): executa inline por setInterval no próprio processo.
 * O consumo real acontece no worker criado aqui mesmo.
 */
@Injectable()
export class SyncSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SyncSchedulerService.name);
  private readonly intervalMs: number;
  private fallbackTimer?: ReturnType<typeof setInterval>;
  private producerTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly sync: SyncService,
    private readonly queue: QueueService,
    config: ConfigService,
  ) {
    this.intervalMs = config.get<number>('SYNC_INTERVAL_MS', 600000);
  }

  async onModuleInit() {
    // Worker (consumidor) sempre registrado quando Redis disponível.
    if (this.queue.isAvailable()) {
      this.queue.createWorker(SYNC_QUEUE_NAME, async (job) => {
        if (job.name === 'run-sync') {
          const res = await this.sync.runAll({ full: job.data === 'full' });
          this.logger.log(`Sync (BullMQ) concluído: ${JSON.stringify(res)}`);
        }
        if (job.name === 'reclassify') {
          const res = await this.sync.recalculateAllClassifications();
          this.logger.log(`Reclassificação (BullMQ): ${JSON.stringify(res)}`);
        }
      });
    }

    // Produtor periódico: produz jobs na fila quando Redis disponível,
    // senão executa inline (fallback).
    const tick = () => {
      if (this.queue.isAvailable()) {
        this.queue.enqueue(SYNC_QUEUE_NAME, 'run-sync', {
          jobId: `sync-${Date.now()}`,
          removeOnComplete: 100,
          attempts: 1,
        }).then(() => {
          this.queue.enqueue(SYNC_QUEUE_NAME, 'reclassify', {
            jobId: `reclassify-${Date.now()}`,
            removeOnComplete: 100,
            attempts: 1,
          });
        });
      }
    };

    if (this.queue.isAvailable()) {
      this.producerTimer = setInterval(tick, this.intervalMs);
      this.producerTimer.unref?.();
      this.logger.log('Sincronização agendada via produtor BullMQ');
    } else {
      this.fallbackTimer = setInterval(() => {
        this.sync.runAll({}).then((res) => {
          this.logger.log(`Sync automático (fallback): ${JSON.stringify(res)}`);
        });
        this.sync.recalculateAllClassifications().then((res) => {
          this.logger.log(`Reclassificação (fallback): ${JSON.stringify(res)}`);
        });
      }, this.intervalMs);
      this.fallbackTimer.unref?.();
      this.logger.log('Sincronização agendada via setInterval (sem Redis)');
    }
  }
}