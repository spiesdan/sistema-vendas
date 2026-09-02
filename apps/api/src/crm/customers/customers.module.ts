import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { CustomerIntelligenceService } from '../services/customer-intelligence.service';
import { AuditService } from '../../common/audit.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, CustomerIntelligenceService, AuditService],
  exports: [CustomersService],
})
export class CustomersModule {}