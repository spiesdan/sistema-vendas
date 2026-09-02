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
import { LeadService, CreateLeadInput, LeadListQuery } from './lead.service';
import type { LeadStatus } from '@prisma/client';

@Controller('leads')
@UseGuards(AuthGuard('jwt'))
export class LeadController {
  constructor(private readonly leads: LeadService) {}

  @Get()
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE', 'MARKETING')
  list(@Query() query: LeadListQuery) {
    return this.leads.list(query);
  }

  @Get('funnel')
  @Roles('ADMIN', 'GESTOR', 'MARKETING')
  funnel() {
    return this.leads.funnel();
  }

  @Get(':id')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE', 'MARKETING')
  detail(@Param('id') id: string) {
    return this.leads.findById(id);
  }

  @Post()
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE', 'MARKETING')
  create(@Body() body: CreateLeadInput) {
    return this.leads.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE')
  update(@Param('id') id: string, @Body() body: Partial<CreateLeadInput>) {
    return this.leads.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN', 'GESTOR')
  remove(@Param('id') id: string) {
    return this.leads.delete(id);
  }

  @Post(':id/move')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE')
  move(@Param('id') id: string, @Body() body: { status: LeadStatus }) {
    return this.leads.moveTo(id, body.status);
  }

  @Patch(':id/salesperson')
  @Roles('ADMIN', 'GESTOR')
  assignSalesperson(@Param('id') id: string, @Body() body: { salespersonId: string }) {
    return this.leads.assignSalesperson(id, body.salespersonId);
  }

  @Patch(':id/qualify')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'MARKETING')
  qualify(@Param('id') id: string, @Body() body: { potential: string }) {
    return this.leads.qualify(id, body.potential);
  }

  @Post(':id/convert')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL')
  convert(@Param('id') id: string) {
    return this.leads.convert(id);
  }
}