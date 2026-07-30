import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, EnrollmentSource } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';
import { CourseAccessService } from './course-access.service';

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly audit: AuditService,
  ) {}

  async enrollFree(user: AuthUser, courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.priceCents > 0) {
      throw new BadRequestException('Paid course requires checkout');
    }
    try {
      const enrollment = await this.prisma.enrollment.create({
        data: {
          courseId,
          userId: user.id,
          source: EnrollmentSource.FREE,
        },
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
      const enrollment = await this.prisma.enrollment.create({
        data: {
          courseId,
          userId: targetUserId,
          source: EnrollmentSource.GRANT,
          grantedBy: actor.realUserId,
        },
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

  listMine(userId: string) {
    return this.prisma.enrollment.findMany({
      where: { userId },
      include: { course: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
