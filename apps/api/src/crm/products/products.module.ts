import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { AuditService } from '../../common/audit.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, AuditService],
  exports: [ProductsService],
})
export class ProductsModule {}