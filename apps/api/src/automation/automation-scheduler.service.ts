import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AutomationService } from './automation.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService, MESSAGING_QUEUE_NAME } from '../queue/queue.service';

/**
 * Programador de automações: ejecuta automações activas sobre sus candidatos.
 * Modo BullMQ: un producer periódico encola el job 'run-automations' y el
 * worker consume. Sin Redis cae a setInterval (fallback inline).
 */
@Injectable()
export class AutomationSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AutomationSchedulerService.name);
  private readonly intervalMs: number;
  private fallbackTimer?: ReturnType<typeof setInterval>;
  private producerTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly automation: AutomationService,
    private readonly queue: QueueService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.intervalMs = config.get<number>('AUTOMATION_INTERVAL_MS', 900000);
  }

  async onModuleInit() {
    if (this.queue.isAvailable()) {
      this.queue.createWorker(MESSAGING_QUEUE_NAME, async (job) => {
        if (job.name === 'run-automations') {
          await this.runPending();
        }
      });
      this.producerTimer = setInterval(() => {
        this.queue.enqueue(MESSAGING_QUEUE_NAME, 'run-automations', {
          jobId: `automations-${Date.now()}`,
          removeOnComplete: 100,
          attempts: 1,
        });
      }, this.intervalMs);
      this.producerTimer.unref?.();
      this.logger.log('Automações agendadas via produtor BullMQ');
    } else {
      this.fallbackTimer = setInterval(() => {
        this.runPending();
      }, this.intervalMs);
      this.fallbackTimer.unref?.();
      this.logger.log('Automações agendadas via setInterval (sem Redis)');
    }
  }

  private async runPending() {
    const automations = await this.prisma.automation.findMany({
      where: { enabled: true, status: 'ACTIVE' },
    });
    let executed = 0;
    for (const automation of automations) {
      try {
        const candidates = await this.automation.findCandidates(automation.id);
        const config = (automation.config as { limit?: number } | null) ?? {};
        const limit = Number(config.limit ?? 10);
        for (const customer of candidates.slice(0, limit)) {
          const res = await this.automation.run(automation.id, customer.id);
          if (res.ok && !res.skipped) executed++;
        }
      } catch (err) {
        this.logger.warn(`Automação ${automation.name}: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (executed) this.logger.log(`Automações ejecutadas: ${executed}`);
  }
}