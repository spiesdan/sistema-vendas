import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { CopilotService } from './copilot.service';

@Controller('copilot')
@UseGuards(AuthGuard('jwt'))
export class CopilotController {
  constructor(private readonly copilot: CopilotService) {}

  @Get('overview')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE')
  overview() {
    return this.copilot.overview();
  }

  @Get('forecast')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL')
  forecast(@Query('days') days?: string) {
    return this.copilot.forecast({ days: days ? Number(days) : undefined });
  }

  @Get('best-time')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE')
  bestTime(@Query('customerId') customerId?: string) {
    return this.copilot.bestTimeToContact(customerId);
  }

  @Get('optimization')
  @Roles('ADMIN', 'GESTOR')
  optimization() {
    return this.copilot.optimization();
  }
}