import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { UsersService } from './users.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/roles.guard';

@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Roles('ADMIN', 'GESTOR')
  findAll() {
    return this.users.findAll();
  }

  @Post()
  @Roles('ADMIN')
  async updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { userId: string; role?: string; active?: boolean },
  ) {
    const updated = await this.users.update(body.userId, {
      role: body.role as never,
      active: body.active,
    });
    await this.audit.record({
      userId: user.userId,
      entityType: 'User',
      entityId: body.userId,
      action: 'update',
      changes: { role: body.role, active: body.active },
    });
    return updated;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }
}