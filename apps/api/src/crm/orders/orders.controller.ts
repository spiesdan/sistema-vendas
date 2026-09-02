import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OrdersService, CreateOrderInput, OrderListQuery } from './orders.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from '../../common/audit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/guards/roles.guard';

@Controller('orders')
@UseGuards(AuthGuard('jwt'))
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query() query: OrderListQuery) {
    return this.orders.list(query);
  }

  @Get('summary')
  summary() {
    return this.orders.summary();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.orders.findById(id);
  }

  @Post()
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'REPRESENTANTE', 'ATENDENTE')
  async create(
    @Body() body: CreateOrderInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.orders.create(body);
    await this.audit.record({
      userId: user.userId,
      entityType: 'Order',
      entityId: created.id,
      action: 'created',
      changes: body,
      ip: (req as unknown as { ip?: string }).ip,
      source: body.source,
    });
    return created;
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'REPRESENTANTE', 'ATENDENTE')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const updated = await this.orders.updateStatus(id, body.status);
    await this.audit.record({
      userId: user.userId,
      entityType: 'Order',
      entityId: id,
      action: 'status-updated',
      changes: { status: body.status },
    });
    return updated;
  }

  @Post('lost-sales')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'REPRESENTANTE', 'ATENDENTE')
  lostSale(
    @Body()
    body: {
      customerId?: string;
      orderId?: string;
      reason: string;
      description?: string;
      value?: number;
    },
  ) {
    return this.orders.registerLostSale(body);
  }
}