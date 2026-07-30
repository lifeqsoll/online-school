import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async append(params: {
    action: AuditAction;
    actorId?: string | null;
    targetId?: string | null;
    meta?: Prisma.InputJsonValue;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    return this.prisma.auditLog.create({
      data: {
        action: params.action,
        actorId: params.actorId ?? null,
        targetId: params.targetId ?? null,
        meta: params.meta ?? undefined,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  }
}
