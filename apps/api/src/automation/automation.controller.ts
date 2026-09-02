import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { AutomationService, CreateAutomationInput, AutomationListQuery } from './automation.service';

@Controller('automation')
@UseGuards(AuthGuard('jwt'))
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Get()
  @Roles('ADMIN', 'GESTOR', 'MARKETING')
  list(@Query() query: AutomationListQuery) {
    return this.automation.list(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'GESTOR', 'MARKETING')
  detail(@Param('id') id: string) {
    return this.automation.findById(id);
  }

  @Post()
  @Roles('ADMIN', 'GESTOR')
  create(@Body() body: CreateAutomationInput) {
    return this.automation.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN', 'GESTOR')
  update(@Param('id') id: string, @Body() body: Partial<CreateAutomationInput>) {
    return this.automation.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.automation.delete(id);
  }

  @Patch(':id/enabled')
  @Roles('ADMIN', 'GESTOR')
  setEnabled(@Param('id') id: string, @Body() body: { enabled: boolean }) {
    return this.automation.setEnabled(id, body.enabled);
  }

  @Post(':id/run')
  @Roles('ADMIN', 'GESTOR')
  run(@Param('id') id: string, @Body() body: { customerId?: string; dryRun?: boolean }) {
    return this.automation.schedule({ automationId: id, customerId: body.customerId, dryRun: body.dryRun });
  }

  @Get(':id/candidates')
  @Roles('ADMIN', 'GESTOR', 'MARKETING')
  candidates(@Param('id') id: string) {
    return this.automation.findCandidates(id);
  }
}