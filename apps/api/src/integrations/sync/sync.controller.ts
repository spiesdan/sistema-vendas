import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SyncService } from './sync.service';
import { Roles } from '../../common/decorators/roles.decorator';
import type { IntegrationProvider } from '@prisma/client';

@Controller('integrations/sync')
@UseGuards(AuthGuard('jwt'))
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('run')
  @Roles('ADMIN', 'GESTOR')
  run(@Body() body: { full?: boolean; provider?: string }) {
    return this.sync.runAll({ full: body.full ?? false, provider: body.provider as IntegrationProvider | undefined });
  }

  @Post('retry')
  @Roles('ADMIN', 'GESTOR')
  retry() {
    return this.sync.retryFailed();
  }

  @Get('status')
  @Roles('ADMIN', 'GESTOR')
  status() {
    return this.sync.status();
  }

  @Post('reclassify')
  @Roles('ADMIN', 'GESTOR')
  reclassify() {
    return this.sync.recalculateAllClassifications();
  }

  @Post('push-order/:orderId')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL')
  pushOrder(@Body() body: { orderId: string }) {
    return this.sync.pushOrderToErp(body.orderId);
  }
}