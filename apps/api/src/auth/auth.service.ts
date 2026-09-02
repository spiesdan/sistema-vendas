import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import type { User } from '@prisma/client';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.active) return null;
    if (!verifyPassword(password, user.passwordHash)) return null;
    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      salespersonId: user.salespersonId ?? null,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: this.safeUser(user),
    };
  }

  async register(createUser: {
    name: string;
    email: string;
    password: string;
    role?: User['role'];
  }) {
    const email = createUser.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('E-mail já cadastrado');

    const user = await this.prisma.user.create({
      data: {
        name: createUser.name,
        email,
        passwordHash: hashPassword(createUser.password),
        role: createUser.role ?? 'COMERCIAL',
      },
    });
    return { user: this.safeUser(user) };
  }

  safeUser(user: User) {
    const { passwordHash, ...safe } = user;
    return safe;
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Usuário não encontrado');
    return { user: this.safeUser(user) };
  }
}