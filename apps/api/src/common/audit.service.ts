import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditRecordInput {
  userId?: string;
  entityType: string;
  entityId?: string;
  action: string;
  changes?: unknown;
  ip?: string;
  userAgent?: string;
  source?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: AuditRecordInput) {
    return this.prisma.auditLog.create({
      data: {
        userId: input.userId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        changes: input.changes ? (input.changes as object) : undefined,
        ip: input.ip,
        userAgent: input.userAgent,
        source: input.source,
      },
    });
  }

  async forEntity(entityType: string, entityId: string, limit = 50) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}