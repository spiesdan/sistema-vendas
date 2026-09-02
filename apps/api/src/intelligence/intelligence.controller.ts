import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import {
  IntelligenceService,
  RecomputeOptions,
  NextBestAction,
  AbandonedSale,
} from './intelligence.service';

@Controller('intelligence')
@UseGuards(AuthGuard('jwt'))
export class IntelligenceController {
  constructor(private readonly intelligence: IntelligenceService) {}

  @Post('recompute')
  @Roles('ADMIN', 'GESTOR')
  recompute(@Query() query: RecomputeOptions) {
    return this.intelligence.recalculateAll(query);
  }

  @Get('actions')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE')
  nextBestActions(@Query('limit') limit?: string) {
    return this.intelligence.nextBestActions(limit ? Number(limit) : undefined);
  }

  @Get('abandoned')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL')
  abandonedSales(@Query('limit') limit?: string, @Query('minDropPct') minDropPct?: string) {
    return this.intelligence.abandonedSales({
      limit: limit ? Number(limit) : undefined,
      minDropPct: minDropPct ? Number(minDropPct) : undefined,
    });
  }

  @Get('recommendations')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE', 'MARKETING')
  recommendations(@Query('customerId') customerId: string, @Query('productId') productId?: string) {
    return this.intelligence.recommendations(customerId, productId);
  }

  @Patch('recommendations/:id/accept')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'MARKETING')
  acceptRecommendation(@Param('id') id: string) {
    return this.intelligence.acceptRecommendation(id);
  }

  @Post('cross-sell')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'MARKETING')
  crossSell(@Body() body: { customerId: string }) {
    return this.intelligence.crossSell(body.customerId);
  }

  @Get('lost-sales')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE')
  lostSales(@Query('customerId') customerId?: string, @Query('recovered') recovered?: string) {
    return this.intelligence.lostSales(customerId, recovered === 'true');
  }

  @Get('lost-sales/:id')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE')
  lostSaleDetail(@Param('id') id: string) {
    return this.intelligence.findByIdLostSale(id);
  }

  @Post('lost-sales')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL')
  createLostSale(
    @Body() body: { orderId?: string; customerId?: string; reason: string; description?: string; value?: number },
  ) {
    return this.intelligence.createLostSale(body);
  }

  @Patch('lost-sales/:id/recover')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL')
  recoverLostSale(@Param('id') id: string) {
    return this.intelligence.recoverLostSale(id);
  }

  @Get('opportunities')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE')
  openOpportunities(@Query('status') status?: string, @Query('salespersonId') salespersonId?: string) {
    return this.intelligence.openOpportunities({ status, salespersonId });
  }

  @Post('opportunities')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL')
  createOpportunity(
    @Body() body: { customerId?: string; leadId?: string; title: string; description?: string; value?: number; source?: string; salespersonId?: string },
  ) {
    return this.intelligence.createOpportunity(body);
  }

  @Patch('opportunities/:id')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL')
  updateOpportunity(@Param('id') id: string, @Body() body: { status?: string; value?: number; assignedUserId?: string }) {
    return this.intelligence.updateOpportunity(id, body);
  }
}