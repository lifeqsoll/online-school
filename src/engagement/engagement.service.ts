import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
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

@Injectable()
export class EngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly outbox: OutboxService,
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
    if (type === EngagementTypeDto.COMPLETE && progress < 90 && dto.progressPct == null) {
      progress = 90;
    }
    if (type === EngagementTypeDto.COMPLETE && progress < 90) {
      throw new BadRequestException('COMPLETE requires progressPct >= 90');
    }
    if (progress >= 90 && type === EngagementTypeDto.VIEW) {
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
      const data = {
        courseId,
        maxProgressPct,
        viewedAt:
          type === EngagementTypeDto.VIEW ||
          type === EngagementTypeDto.COMPLETE
            ? existing?.viewedAt ?? now
            : existing?.viewedAt,
        completedAt:
          type === EngagementTypeDto.COMPLETE
            ? existing?.completedAt ?? now
            : existing?.completedAt,
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
}
