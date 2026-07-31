import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EnrollmentStatus,
  LessonCompletionSource,
} from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { CryptoService } from '../common/crypto/crypto.service';
import { CourseAccessService } from '../enrollments/course-access.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';

export enum EngagementTypeDto {
  VIEW = 'VIEW',
  COMPLETE = 'COMPLETE',
  SKIP = 'SKIP',
}

export class EngagementDto {
  @IsEnum(EngagementTypeDto)
  type!: EngagementTypeDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPct?: number;
}

export class SetAttendanceDto {
  @IsBoolean()
  completed!: boolean;

  /** Mark/unmark every ACTIVE enrollee when true */
  @IsOptional()
  @IsBoolean()
  all?: boolean;

  @ValidateIf((o: SetAttendanceDto) => !o.all)
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  userIds?: string[];
}

const COMPLETE_PCT = 80;

@Injectable()
export class EngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly outbox: OutboxService,
    private readonly crypto: CryptoService,
  ) {}

  async record(user: AuthUser, lessonId: string, dto: EngagementDto) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: true },
    });
    if (!lesson) throw new NotFoundException();
    const courseId = lesson.module.courseId;
    if (!(await this.access.hasContentAccess(user, courseId))) {
      throw new ForbiddenException();
    }

    let progress = dto.progressPct ?? 0;
    let type = dto.type;
    if (
      type === EngagementTypeDto.COMPLETE &&
      progress < COMPLETE_PCT &&
      dto.progressPct == null
    ) {
      progress = COMPLETE_PCT;
    }
    if (type === EngagementTypeDto.COMPLETE && progress < COMPLETE_PCT) {
      throw new BadRequestException(
        `COMPLETE requires progressPct >= ${COMPLETE_PCT}`,
      );
    }
    if (progress >= COMPLETE_PCT && type === EngagementTypeDto.VIEW) {
      type = EngagementTypeDto.COMPLETE;
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.lessonEngagement.findUnique({
        where: {
          userId_lessonId: { userId: user.id, lessonId },
        },
      });
      const maxProgressPct = Math.max(existing?.maxProgressPct ?? 0, progress);
      const markingComplete = type === EngagementTypeDto.COMPLETE;
      const data = {
        courseId,
        maxProgressPct,
        viewedAt:
          type === EngagementTypeDto.VIEW || markingComplete
            ? existing?.viewedAt ?? now
            : existing?.viewedAt,
        completedAt: markingComplete
          ? existing?.completedAt ?? now
          : existing?.completedAt,
        completedBy: markingComplete
          ? existing?.completedBy ?? LessonCompletionSource.AUTO
          : existing?.completedBy,
        skippedAt:
          type === EngagementTypeDto.SKIP
            ? existing?.skippedAt ?? now
            : existing?.skippedAt,
      };

      const row = existing
        ? await tx.lessonEngagement.update({
            where: { id: existing.id },
            data,
          })
        : await tx.lessonEngagement.create({
            data: {
              userId: user.id,
              lessonId,
              ...data,
            },
          });

      await this.outbox.enqueue(tx, 'LESSON_ENGAGEMENT', {
        userId: user.id,
        lessonId,
        courseId,
        progressPct: maxProgressPct,
        viewed: !!row.viewedAt,
        completed: !!row.completedAt,
        skipped: !!row.skippedAt,
      });

      return row;
    });
  }

  async listAttendance(actor: AuthUser, courseId: string, lessonId: string) {
    if (!(await this.access.canManageCourse(actor, courseId))) {
      throw new ForbiddenException();
    }
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { select: { courseId: true, title: true } } },
    });
    if (!lesson || lesson.module.courseId !== courseId) {
      throw new NotFoundException('Lesson not found');
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId, status: EnrollmentStatus.ACTIVE },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            firstNameEnc: true,
            lastNameEnc: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const engagements = await this.prisma.lessonEngagement.findMany({
      where: {
        lessonId,
        userId: { in: enrollments.map((e) => e.userId) },
      },
      select: {
        userId: true,
        viewedAt: true,
        completedAt: true,
        completedBy: true,
        maxProgressPct: true,
      },
    });
    const byUser = new Map(engagements.map((e) => [e.userId, e]));

    return {
      lesson: {
        id: lesson.id,
        title: lesson.title,
        type: lesson.type,
        scheduledAt: lesson.scheduledAt,
        moduleTitle: lesson.module.title,
      },
      students: enrollments.map((e) => {
        const eng = byUser.get(e.userId);
        let displayName = 'Ученик';
        if (e.user.nickname?.trim()) {
          displayName = e.user.nickname.trim();
        } else {
          try {
            const first = e.user.firstNameEnc
              ? this.crypto.decrypt(e.user.firstNameEnc)
              : '';
            const last = e.user.lastNameEnc
              ? this.crypto.decrypt(e.user.lastNameEnc)
              : '';
            displayName = `${first} ${last}`.trim() || 'Ученик';
          } catch {
            displayName = 'Ученик';
          }
        }
        return {
          userId: e.userId,
          displayName,
          nickname: e.user.nickname,
          viewedAt: eng?.viewedAt ?? null,
          completedAt: eng?.completedAt ?? null,
          completedBy: eng?.completedBy ?? null,
          maxProgressPct: eng?.maxProgressPct ?? 0,
        };
      }),
    };
  }

  async setAttendance(
    actor: AuthUser,
    courseId: string,
    lessonId: string,
    dto: SetAttendanceDto,
  ) {
    if (!(await this.access.canManageCourse(actor, courseId))) {
      throw new ForbiddenException();
    }
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { select: { courseId: true } } },
    });
    if (!lesson || lesson.module.courseId !== courseId) {
      throw new NotFoundException('Lesson not found');
    }

    let userIds: string[] = [];
    if (dto.all) {
      const rows = await this.prisma.enrollment.findMany({
        where: { courseId, status: EnrollmentStatus.ACTIVE },
        select: { userId: true },
      });
      userIds = rows.map((r) => r.userId);
    } else if (dto.userIds?.length) {
      userIds = [...new Set(dto.userIds)];
      const ok = await this.prisma.enrollment.count({
        where: {
          courseId,
          status: EnrollmentStatus.ACTIVE,
          userId: { in: userIds },
        },
      });
      if (ok !== userIds.length) {
        throw new BadRequestException(
          'Some users are not active enrollees of this course',
        );
      }
    } else {
      throw new BadRequestException('Provide userIds or all=true');
    }

    if (!userIds.length) return { count: 0, completed: dto.completed };

    const now = new Date();
    let count = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const userId of userIds) {
        const existing = await tx.lessonEngagement.findUnique({
          where: { userId_lessonId: { userId, lessonId } },
        });

        if (dto.completed) {
          if (existing?.completedAt) {
            await tx.lessonEngagement.update({
              where: { id: existing.id },
              data: {
                completedBy: LessonCompletionSource.CURATOR,
                completedByUserId: actor.realUserId,
              },
            });
            count += 1;
            continue;
          }
          const data = {
            courseId,
            viewedAt: existing?.viewedAt ?? now,
            completedAt: now,
            completedBy: LessonCompletionSource.CURATOR,
            completedByUserId: actor.realUserId,
            maxProgressPct: Math.max(
              existing?.maxProgressPct ?? 0,
              COMPLETE_PCT,
            ),
          };
          if (existing) {
            await tx.lessonEngagement.update({
              where: { id: existing.id },
              data,
            });
          } else {
            await tx.lessonEngagement.create({
              data: { userId, lessonId, ...data },
            });
          }
          count += 1;
          await this.outbox.enqueue(tx, 'LESSON_ENGAGEMENT', {
            userId,
            lessonId,
            courseId,
            progressPct: data.maxProgressPct,
            viewed: true,
            completed: true,
            skipped: !!existing?.skippedAt,
            source: 'CURATOR',
          });
        } else {
          if (!existing?.completedAt) continue;
          await tx.lessonEngagement.update({
            where: { id: existing.id },
            data: {
              completedAt: null,
              completedBy: null,
              completedByUserId: actor.realUserId,
            },
          });
          count += 1;
          await this.outbox.enqueue(tx, 'LESSON_ENGAGEMENT', {
            userId,
            lessonId,
            courseId,
            progressPct: existing.maxProgressPct,
            viewed: !!existing.viewedAt,
            completed: false,
            skipped: !!existing.skippedAt,
            source: 'CURATOR_REVOKE',
          });
        }
      }
    });

    return { count, completed: dto.completed };
  }
}
