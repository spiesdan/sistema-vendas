import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { OrdersService } from '../crm/orders/orders.service';
import { CustomerIntelligenceService } from '../crm/services/customer-intelligence.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, OrdersService, CustomerIntelligenceService],
  exports: [DashboardService],
})
export class DashboardModule {}