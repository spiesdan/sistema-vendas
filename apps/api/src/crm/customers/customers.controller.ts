import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CustomersService, CustomerListQuery, CreateCustomerInput } from './customers.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from '../../common/audit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/guards/roles.guard';

@Controller('customers')
@UseGuards(AuthGuard('jwt'))
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query() query: CustomerListQuery) {
    return this.customers.list(query);
  }

  @Get('lookup/whatsapp/:number')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'REPRESENTANTE', 'ATENDENTE', 'MARKETING', 'FINANCEIRO', 'SUPORTE')
  byWhatsapp(@Param('number') number: string) {
    return this.customers.byWhatsapp(number);
  }

  @Get('map')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'REPRESENTANTE', 'ATENDENTE', 'MARKETING', 'FINANCEIRO', 'SUPORTE')
  map() {
    return this.customers.mapData();
  }

  @Get(':id')
  detail(@Param('id') id: string, @Query() q: { analyze?: string }) {
    if (q.analyze === 'true') return this.customers.findAnalyzed(id);
    return this.customers.findById(id);
  }

  @Post()
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL')
  async create(
    @Body() body: CreateCustomerInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.customers.create(body);
    await this.audit.record({
      userId: user.userId,
      entityType: 'Customer',
      entityId: created.id,
      action: 'created',
      changes: body,
      ip: (req as unknown as { ip?: string }).ip,
    });
    return created;
  }

  @Patch(':id')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<CreateCustomerInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const updated = await this.customers.update(id, body);
    await this.audit.record({
      userId: user.userId,
      entityType: 'Customer',
      entityId: id,
      action: 'updated',
      changes: body,
    });
    return updated;
  }

  @Post(':id/recompute')
  @Roles('ADMIN', 'GESTOR')
  recompute(@Param('id') id: string) {
    return this.customers.recomputeMetrics(id);
  }
}