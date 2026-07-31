import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourseAccessService } from '../enrollments/course-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';

export type LessonContentAccess = {
  open: boolean;
  unlocksAt: Date | null;
  contentUnlockDaysBefore: number;
  contentUnlockedForAll: boolean;
  grantedToYou: boolean;
};

@Injectable()
export class LessonContentAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
  ) {}

  unlocksAtFor(scheduledAt: Date | null, daysBefore: number): Date | null {
    if (!scheduledAt) return null;
    const d = Math.max(0, daysBefore);
    return new Date(scheduledAt.getTime() - d * 24 * 60 * 60 * 1000);
  }

  async evaluate(
    actor: AuthUser,
    lessonId: string,
  ): Promise<LessonContentAccess & { courseId: string; lesson: { id: string; title: string; scheduledAt: Date | null; meetingUrl: string | null } }> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const courseId = lesson.module.courseId;
    const days = lesson.contentUnlockDaysBefore ?? 7;
    const unlocksAt = this.unlocksAtFor(lesson.scheduledAt, days);

    if (await this.access.canManageCourse(actor, courseId)) {
      return {
        open: true,
        unlocksAt,
        contentUnlockDaysBefore: days,
        contentUnlockedForAll: lesson.contentUnlockedForAll,
        grantedToYou: false,
        courseId,
        lesson: {
          id: lesson.id,
          title: lesson.title,
          scheduledAt: lesson.scheduledAt,
          meetingUrl: lesson.meetingUrl,
        },
      };
    }

    if (!(await this.access.hasContentAccess(actor, courseId))) {
      throw new ForbiddenException('No access to this lesson');
    }

    if (!lesson.scheduledAt) {
      return {
        open: true,
        unlocksAt: null,
        contentUnlockDaysBefore: days,
        contentUnlockedForAll: lesson.contentUnlockedForAll,
        grantedToYou: false,
        courseId,
        lesson: {
          id: lesson.id,
          title: lesson.title,
          scheduledAt: lesson.scheduledAt,
          meetingUrl: lesson.meetingUrl,
        },
      };
    }

    if (lesson.contentUnlockedForAll) {
      return {
        open: true,
        unlocksAt,
        contentUnlockDaysBefore: days,
        contentUnlockedForAll: true,
        grantedToYou: false,
        courseId,
        lesson: {
          id: lesson.id,
          title: lesson.title,
          scheduledAt: lesson.scheduledAt,
          meetingUrl: lesson.meetingUrl,
        },
      };
    }

    const grant = await this.prisma.lessonContentGrant.findUnique({
      where: {
        lessonId_userId: { lessonId, userId: actor.id },
      },
    });
    if (grant) {
      return {
        open: true,
        unlocksAt,
        contentUnlockDaysBefore: days,
        contentUnlockedForAll: false,
        grantedToYou: true,
        courseId,
        lesson: {
          id: lesson.id,
          title: lesson.title,
          scheduledAt: lesson.scheduledAt,
          meetingUrl: lesson.meetingUrl,
        },
      };
    }

    const open = !!unlocksAt && Date.now() >= unlocksAt.getTime();
    return {
      open,
      unlocksAt,
      contentUnlockDaysBefore: days,
      contentUnlockedForAll: false,
      grantedToYou: false,
      courseId,
      lesson: {
        id: lesson.id,
        title: lesson.title,
        scheduledAt: lesson.scheduledAt,
        meetingUrl: lesson.meetingUrl,
      },
    };
  }

  async assertContentOpen(actor: AuthUser, lessonId: string) {
    const access = await this.evaluate(actor, lessonId);
    if (!access.open) {
      throw new ForbiddenException({
        message: 'Lesson content is locked until unlock date',
        unlocksAt: access.unlocksAt,
        code: 'LESSON_CONTENT_LOCKED',
      });
    }
    return access;
  }

  /** Batch evaluate for many lessons (same course viewer). */
  async evaluateMany(
    actor: AuthUser,
    lessons: Array<{
      id: string;
      scheduledAt: Date | null;
      contentUnlockDaysBefore: number;
      contentUnlockedForAll: boolean;
    }>,
    courseId: string,
  ): Promise<Map<string, LessonContentAccess>> {
    const map = new Map<string, LessonContentAccess>();
    if (!lessons.length) return map;

    if (await this.access.canManageCourse(actor, courseId)) {
      for (const l of lessons) {
        map.set(l.id, {
          open: true,
          unlocksAt: this.unlocksAtFor(l.scheduledAt, l.contentUnlockDaysBefore),
          contentUnlockDaysBefore: l.contentUnlockDaysBefore,
          contentUnlockedForAll: l.contentUnlockedForAll,
          grantedToYou: false,
        });
      }
      return map;
    }

    const grants = await this.prisma.lessonContentGrant.findMany({
      where: {
        userId: actor.id,
        lessonId: { in: lessons.map((l) => l.id) },
      },
      select: { lessonId: true },
    });
    const granted = new Set(grants.map((g) => g.lessonId));
    const now = Date.now();

    for (const l of lessons) {
      const unlocksAt = this.unlocksAtFor(
        l.scheduledAt,
        l.contentUnlockDaysBefore,
      );
      if (!l.scheduledAt) {
        map.set(l.id, {
          open: true,
          unlocksAt: null,
          contentUnlockDaysBefore: l.contentUnlockDaysBefore,
          contentUnlockedForAll: l.contentUnlockedForAll,
          grantedToYou: false,
        });
        continue;
      }
      if (l.contentUnlockedForAll || granted.has(l.id)) {
        map.set(l.id, {
          open: true,
          unlocksAt,
          contentUnlockDaysBefore: l.contentUnlockDaysBefore,
          contentUnlockedForAll: l.contentUnlockedForAll,
          grantedToYou: granted.has(l.id),
        });
        continue;
      }
      const open = !!unlocksAt && now >= unlocksAt.getTime();
      map.set(l.id, {
        open,
        unlocksAt,
        contentUnlockDaysBefore: l.contentUnlockDaysBefore,
        contentUnlockedForAll: false,
        grantedToYou: false,
      });
    }
    return map;
  }
}
