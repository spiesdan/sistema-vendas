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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/roles.guard';
import type { CampaignStatus } from '@prisma/client';
import { CampaignsService, CreateCampaignInput, CampaignListQuery } from './campaigns.service';

@Controller('campaigns')
@UseGuards(AuthGuard('jwt'))
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @Roles('ADMIN', 'GESTOR', 'MARKETING')
  list(@Query() query: CampaignListQuery) {
    return this.campaigns.list(query);
  }

  @Get('preview')
  @Roles('ADMIN', 'GESTOR', 'MARKETING')
  preview(@Query('id') id: string, @Query('sample') sample?: string) {
    return this.campaigns.preview(id, sample ? Number(sample) : undefined);
  }

  @Get(':id')
  @Roles('ADMIN', 'GESTOR', 'MARKETING')
  detail(@Param('id') id: string) {
    return this.campaigns.findById(id);
  }

  @Get(':id/stats')
  @Roles('ADMIN', 'GESTOR', 'MARKETING')
  stats(@Param('id') id: string) {
    return this.campaigns.stats(id);
  }

  @Post()
  @Roles('ADMIN', 'GESTOR', 'MARKETING')
  create(@Body() body: CreateCampaignInput, @CurrentUser() user: AuthenticatedUser) {
    return this.campaigns.create({ ...body, createdById: user?.userId });
  }

  @Patch(':id')
  @Roles('ADMIN', 'GESTOR')
  update(@Param('id') id: string, @Body() body: Partial<CreateCampaignInput>) {
    return this.campaigns.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.campaigns.delete(id);
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'GESTOR', 'MARKETING')
  setStatus(@Param('id') id: string, @Body() body: { status: CampaignStatus }) {
    return this.campaigns.setStatus(id, body.status);
  }

  @Post(':id/prepare')
  @Roles('ADMIN', 'GESTOR', 'MARKETING')
  prepare(@Param('id') id: string) {
    return this.campaigns.prepare(id);
  }

  @Post(':id/send')
  @Roles('ADMIN', 'GESTOR', 'MARKETING')
  send(@Param('id') id: string, @Body() body: { limit?: number }) {
    return this.campaigns.send(id, body?.limit);
  }
}