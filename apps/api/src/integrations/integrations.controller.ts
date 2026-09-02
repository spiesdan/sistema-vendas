import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IntegrationRegistryService } from './integration-registry.service';
import { SyncService } from './sync/sync.service';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('integrations')
@UseGuards(AuthGuard('jwt'))
export class IntegrationsController {
  constructor(
    private readonly registry: IntegrationRegistryService,
    private readonly sync: SyncService,
  ) {}

  @Get('sources')
  sources() {
    return this.registry.listSources();
  }

  @Post('sources')
  @Roles('ADMIN', 'GESTOR')
  setSource(@Body() body: { entity: string; provider: string }) {
    return this.registry.setSource(body.entity, body.provider);
  }

  @Get('status')
  @Roles('ADMIN', 'GESTOR')
  status() {
    return this.sync.status();
  }

  @Get('health')
  health() {
    return this.sync.health();
  }
}