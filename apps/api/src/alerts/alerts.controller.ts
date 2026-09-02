import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { AlertsService } from './alerts.service';

@Controller('alerts')
@UseGuards(AuthGuard('jwt'))
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE', 'MARKETING', 'SUPORTE')
  list() {
    return this.alerts.list();
  }
}