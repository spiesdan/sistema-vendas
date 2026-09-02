import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerIntelligenceService } from '../crm/services/customer-intelligence.service';
import { LeadService } from './lead.service';
import { LeadController } from './lead.controller';

@Module({
  imports: [PrismaModule],
  providers: [CustomerIntelligenceService, LeadService],
  controllers: [LeadController],
  exports: [LeadService],
})
export class LeadsModule {}