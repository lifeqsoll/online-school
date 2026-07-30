import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, GlobalRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';

@Injectable()
export class ImpersonationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async start(actor: AuthUser, targetUserId: string, ip?: string, ua?: string) {
    if (actor.impersonation) {
      throw new ForbiddenException('Nested impersonation is forbidden');
    }
    if (actor.realGlobalRole !== GlobalRole.ADMIN) {
      throw new ForbiddenException(
        'Impersonation is restricted to administrators in Foundation',
      );
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target || !target.isActive) {
      throw new NotFoundException('Target user not found');
    }
    if (target.globalRole === GlobalRole.ADMIN) {
      throw new ForbiddenException('Cannot impersonate an admin');
    }

    const accessToken = await this.auth.signAccessToken(target, {
      impersonatorId: actor.realUserId,
      targetUserId: target.id,
    });

    await this.audit.append({
      action: AuditAction.IMPERSONATE_START,
      actorId: actor.realUserId,
      targetId: target.id,
      ip,
      userAgent: ua,
    });

    return { accessToken };
  }

  async stop(actor: AuthUser, ip?: string, ua?: string) {
    if (!actor.impersonation) {
      throw new ForbiddenException('Not impersonating');
    }

    const real = await this.prisma.user.findUnique({
      where: { id: actor.realUserId },
    });
    if (!real || !real.isActive) {
      throw new NotFoundException('Impersonator not found');
    }

    const accessToken = await this.auth.signAccessToken(real);
    await this.audit.append({
      action: AuditAction.IMPERSONATE_STOP,
      actorId: actor.realUserId,
      targetId: actor.impersonation.targetUserId,
      ip,
      userAgent: ua,
    });

    return { accessToken };
  }
}
