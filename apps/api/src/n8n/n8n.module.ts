import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { N8nClient } from './n8n.client';
import { N8nService } from './n8n.service';
import { N8nController, N8nWebhookController } from './n8n.controller';

@Module({
  imports: [PrismaModule],
  providers: [N8nClient, N8nService],
  controllers: [N8nController, N8nWebhookController],
  exports: [N8nClient, N8nService],
})
export class N8nModule {}