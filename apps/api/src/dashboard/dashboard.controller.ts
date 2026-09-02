import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DashboardService } from './dashboard.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/roles.guard';

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  overview() {
    return this.dashboard.overview();
  }

  @Get('representative/daily')
  @Roles('REPRESENTANTE', 'COMERCIAL', 'GESTOR', 'ADMIN')
  representativeDaily(
    @CurrentUser() user: AuthenticatedUser,
    @Query('salespersonId') salespersonId?: string,
  ) {
    const effectiveId = salespersonId ?? user.salespersonId ?? undefined;
    return this.dashboard.representativeDaily(effectiveId);
  }
}