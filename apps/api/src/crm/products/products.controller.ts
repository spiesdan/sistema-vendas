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
import { ProductsService, ProductListQuery, CreateProductInput } from './products.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from '../../common/audit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/guards/roles.guard';

@Controller('products')
@UseGuards(AuthGuard('jwt'))
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query() query: ProductListQuery) {
    return this.products.list(query);
  }

  @Get('low-stock')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL')
  lowStock(@Query('min') min?: string) {
    const minQty = min ? Number(min) : 5;
    return this.products.getLowStock(minQty);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.products.findById(id);
  }

  @Post()
  @Roles('ADMIN', 'GESTOR')
  async create(@Body() body: CreateProductInput, @CurrentUser() user: AuthenticatedUser) {
    const created = await this.products.create(body);
    await this.audit.record({
      userId: user.userId,
      entityType: 'Product',
      entityId: created.id,
      action: 'created',
      changes: body,
    });
    return created;
  }

  @Patch(':id')
  @Roles('ADMIN', 'GESTOR')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<CreateProductInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const updated = await this.products.update(id, body);
    await this.audit.record({
      userId: user.userId,
      entityType: 'Product',
      entityId: id,
      action: 'updated',
      changes: body,
    });
    return updated;
  }

  @Post(':id/price')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL')
  setPrice(
    @Param('id') id: string,
    @Body() body: { value: number; priceTable?: string },
  ) {
    return this.products.setPrice(id, body.value, body.priceTable);
  }

  @Post(':id/stock')
  @Roles('ADMIN', 'GESTOR')
  setStock(
    @Param('id') id: string,
    @Body() body: { quantity: number; warehouse?: string },
  ) {
    return this.products.setStock(id, body.quantity, body.warehouse);
  }
}