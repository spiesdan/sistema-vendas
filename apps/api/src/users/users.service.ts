import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    const { passwordHash, ...safe } = user;
    return safe;
  }

  async update(id: string, data: { role?: string; active?: boolean }) {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.role ? { role: data.role as never } : {}),
        ...(typeof data.active === 'boolean' ? { active: data.active } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });
  }

  async adminCount() {
    return this.prisma.user.count({ where: { role: 'ADMIN' } });
  }
}