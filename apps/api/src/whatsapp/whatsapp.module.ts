import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersModule } from '../crm/orders/orders.module';
import { CustomersModule } from '../crm/customers/customers.module';
import { SyncModule } from '../integrations/sync/sync.module';
import { CustomerIntelligenceService } from '../crm/services/customer-intelligence.service';
import { WhatsappClient } from './whatsapp.client';
import { ChatbotService } from './chatbot.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController, WhatsappWebhookController } from './whatsapp.controller';

@Module({
  imports: [PrismaModule, OrdersModule, CustomersModule, SyncModule],
  providers: [
    WhatsappClient,
    ChatbotService,
    WhatsappService,
    CustomerIntelligenceService,
  ],
  controllers: [WhatsappController, WhatsappWebhookController],
  exports: [WhatsappService, ChatbotService, WhatsappClient],
})
export class WhatsappModule {}