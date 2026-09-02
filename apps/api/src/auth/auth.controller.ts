import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { User } from '@prisma/client';
import { AuthService } from './auth.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(
    @Body() body: { email: string; password: string },
    @Req() req: Request,
  ) {
    void req;
    return this.auth.login(body.email, body.password);
  }

  @Post('register')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  register(@Body() body: { name: string; email: string; password: string; role?: string }) {
    return this.auth.register({
      ...body,
      role: body.role as User['role'] | undefined,
    });
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.userId);
  }
}