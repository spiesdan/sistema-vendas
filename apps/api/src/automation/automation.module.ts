import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { OrdersModule } from '../crm/orders/orders.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { N8nModule } from '../n8n/n8n.module';
import { AutomationService } from './automation.service';
import { AutomationController } from './automation.controller';
import { AutomationSchedulerService } from './automation-scheduler.service';

@Module({
  imports: [PrismaModule, QueueModule, OrdersModule, WhatsappModule, N8nModule],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationSchedulerService],
  exports: [AutomationService],
})
export class AutomationModule {}