import { Module } from '@nestjs/common';
import { OdvixModule } from './odvix/odvix.module';
import { MercosModule } from './mercos/mercos.module';
import { SyncModule } from './sync/sync.module';
import { IntegrationRegistryService } from './integration-registry.service';
import { IntegrationsController } from './integrations.controller';

@Module({
  imports: [OdvixModule, MercosModule, SyncModule],
  controllers: [IntegrationsController],
  providers: [IntegrationRegistryService],
  exports: [IntegrationRegistryService],
})
export class IntegrationsModule {}