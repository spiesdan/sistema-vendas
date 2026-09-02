import { Module } from '@nestjs/common';
import { CustomersModule } from './customers/customers.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { RegionsModule } from './regions/regions.module';
import { CustomerIntelligenceService } from './services/customer-intelligence.service';

@Module({
  imports: [CustomersModule, ProductsModule, OrdersModule, RegionsModule],
  providers: [CustomerIntelligenceService],
  exports: [CustomerIntelligenceService],
})
export class CrmModule {}