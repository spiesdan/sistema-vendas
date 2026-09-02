import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { SyncSchedulerService } from './sync-scheduler.service';
import { OdvixModule } from '../odvix/odvix.module';
import { MercosModule } from '../mercos/mercos.module';
import { IntegrationRegistryService } from '../integration-registry.service';
import { CustomerIntelligenceService } from '../../crm/services/customer-intelligence.service';

@Module({
  imports: [OdvixModule, MercosModule],
  controllers: [SyncController],
  providers: [SyncService, SyncSchedulerService, IntegrationRegistryService, CustomerIntelligenceService],
  exports: [SyncService],
})
export class SyncModule {}