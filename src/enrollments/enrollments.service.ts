import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, EnrollmentSource } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';
import { StorageService } from '../storage/storage.service';
import { CourseAccessService } from './course-access.service';

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly storage: StorageService,
    private readonly crypto: CryptoService,
  ) {}

  async enrollFree(user: AuthUser, courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.priceCents > 0) {
      throw new BadRequestException('Paid course requires checkout');
    }
    try {
      const enrollment = await this.prisma.$transaction(async (tx) => {
        const row = await tx.enrollment.create({
          data: {
            courseId,
            userId: user.id,
            source: EnrollmentSource.FREE,
          },
        });
        await this.outbox.enqueue(tx, 'ENROLLMENT', {
          userId: user.id,
          courseId,
        });
        return row;
      });
      await this.audit.append({
        action: AuditAction.ENROLL,
        actorId: user.realUserId,
        targetId: user.id,
        meta: { courseId, source: 'FREE' },
      });
      return enrollment;
    } catch {
      throw new ConflictException('Already enrolled');
    }
  }

  async grant(actor: AuthUser, courseId: string, targetUserId: string) {
    if (!(await this.access.canManageCourse(actor, courseId))) {
      throw new ForbiddenException('Cannot grant enrollment for this course');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target?.isActive) throw new NotFoundException('Target user not found');

    try {
      const enrollment = await this.prisma.$transaction(async (tx) => {
        const row = await tx.enrollment.create({
          data: {
            courseId,
            userId: targetUserId,
            source: EnrollmentSource.GRANT,
            grantedBy: actor.realUserId,
          },
        });
        await this.outbox.enqueue(tx, 'ENROLLMENT', {
          userId: targetUserId,
          courseId,
        });
        return row;
      });
      await this.audit.append({
        action: AuditAction.GRANT_ENROLL,
        actorId: actor.realUserId,
        targetId: targetUserId,
        meta: { courseId },
      });
      return enrollment;
    } catch {
      throw new ConflictException('Already enrolled');
    }
  }

  async listMine(userId: string) {
    const rows = await this.prisma.enrollment.findMany({
      where: { userId },
      include: { course: true },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      rows.map(async (row) => {
        let coverUrl: string | null = null;
        if (row.course.coverStorageKey) {
          try {
            coverUrl = await this.storage.getSignedGetUrl(
              row.course.coverStorageKey,
            );
          } catch {
            coverUrl = null;
          }
        }
        return {
          ...row,
          course: {
            ...row.course,
            coverStorageKey: undefined,
            coverUrl,
          },
        };
      }),
    );
  }

  async listForCourse(actor: AuthUser, courseId: string) {
    if (!(await this.access.canManageCourse(actor, courseId))) {
      throw new ForbiddenException();
    }
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    const rows = await this.prisma.enrollment.findMany({
      where: { courseId },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            firstNameEnc: true,
            lastNameEnc: true,
            emailEnc: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => {
      let displayName = 'Ученик';
      let email: string | null = null;
      try {
        if (row.user.nickname?.trim()) {
          displayName = row.user.nickname.trim();
        } else {
          const first = row.user.firstNameEnc
            ? this.crypto.decrypt(row.user.firstNameEnc)
            : '';
          const last = row.user.lastNameEnc
            ? this.crypto.decrypt(row.user.lastNameEnc)
            : '';
          displayName = `${first} ${last}`.trim() || 'Ученик';
        }
        email = this.crypto.decrypt(row.user.emailEnc);
      } catch {
        displayName = 'Ученик';
        email = null;
      }
      return {
        id: row.id,
        courseId: row.courseId,
        userId: row.userId,
        status: row.status,
        source: row.source,
        grantedBy: row.grantedBy,
        createdAt: row.createdAt,
        user: {
          id: row.user.id,
          displayName,
          nickname: row.user.nickname,
          email,
          isActive: row.user.isActive,
        },
      };
    });
  }
}
