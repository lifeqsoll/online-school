import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourseEventType } from '@prisma/client';
import { CourseAccessService } from '../enrollments/course-access.service';
import { LessonContentAccessService } from '../lessons/lesson-content-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';
import {
  CreateCourseEventDto,
  UpdateCourseEventDto,
} from './dto/course-event.dto';

@Injectable()
export class CourseEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly lessonContent: LessonContentAccessService,
  ) {}

  async listCourseEvents(
    actor: AuthUser,
    courseId: string,
    from: Date,
    to: Date,
  ) {
    const ok =
      (await this.access.canManageCourse(actor, courseId)) ||
      (await this.access.hasContentAccess(actor, courseId));
    if (!ok) throw new ForbiddenException('No access to course events');
    return this.prisma.courseEvent.findMany({
      where: { courseId, startsAt: { gte: from, lte: to } },
      orderBy: { startsAt: 'asc' },
    });
  }

  async create(actor: AuthUser, courseId: string, dto: CreateCourseEventDto) {
    if (!(await this.access.canManageCourse(actor, courseId))) {
      throw new ForbiddenException('Cannot manage this course');
    }
    await this.assertCourseExists(courseId);
    await this.validateLinks(courseId, dto.lessonId, dto.assignmentId);

    const event = await this.prisma.courseEvent.create({
      data: {
        courseId,
        title: dto.title,
        description: dto.description,
        type: dto.type,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        meetingUrl: dto.type === CourseEventType.LIVE ? dto.meetingUrl : null,
        lessonId: dto.lessonId,
        assignmentId: dto.assignmentId,
        createdById: actor.realUserId,
      },
    });

    if (event.type === CourseEventType.LIVE && event.lessonId) {
      await this.prisma.courseEvent.deleteMany({
        where: {
          lessonId: event.lessonId,
          type: CourseEventType.LIVE,
          id: { not: event.id },
        },
      });
    }

    await this.syncLessonFromEvent(null, event);
    return event;
  }

  async update(actor: AuthUser, id: string, dto: UpdateCourseEventDto) {
    const event = await this.prisma.courseEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    if (!(await this.access.canManageCourse(actor, event.courseId))) {
      throw new ForbiddenException('Cannot manage this course');
    }

    const lessonId =
      dto.lessonId === undefined ? event.lessonId : dto.lessonId;
    const assignmentId =
      dto.assignmentId === undefined ? event.assignmentId : dto.assignmentId;
    await this.validateLinks(
      event.courseId,
      lessonId ?? undefined,
      assignmentId ?? undefined,
    );

    const type = dto.type ?? event.type;
    const updated = await this.prisma.courseEvent.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt:
          dto.endsAt === undefined
            ? undefined
            : dto.endsAt === null
              ? null
              : new Date(dto.endsAt),
        meetingUrl:
          dto.meetingUrl === undefined
            ? type === CourseEventType.LIVE
              ? undefined
              : null
            : type === CourseEventType.LIVE
              ? dto.meetingUrl
              : null,
        lessonId: dto.lessonId === undefined ? undefined : dto.lessonId,
        assignmentId:
          dto.assignmentId === undefined ? undefined : dto.assignmentId,
      },
    });

    if (updated.type === CourseEventType.LIVE && updated.lessonId) {
      await this.prisma.courseEvent.deleteMany({
        where: {
          lessonId: updated.lessonId,
          type: CourseEventType.LIVE,
          id: { not: updated.id },
        },
      });
    }

    await this.syncLessonFromEvent(event, updated);
    return updated;
  }

  async remove(actor: AuthUser, id: string) {
    const event = await this.prisma.courseEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    if (!(await this.access.canManageCourse(actor, event.courseId))) {
      throw new ForbiddenException('Cannot manage this course');
    }
    await this.prisma.storedFile.deleteMany({
      where: { ownerType: 'COURSE_EVENT_MATERIAL', ownerId: id },
    });
    await this.prisma.courseEvent.delete({ where: { id } });
    if (event.type === CourseEventType.LIVE && event.lessonId) {
      await this.prisma.lesson.updateMany({
        where: { id: event.lessonId },
        data: { scheduledAt: null, meetingUrl: null },
      });
    }
    return { ok: true };
  }

  async calendarMine(actor: AuthUser, from: Date, to: Date) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: actor.id, status: 'ACTIVE' },
      select: { courseId: true },
    });
    const courseIds = enrollments.map((e) => e.courseId);
    if (!courseIds.length) return [];
    const events = await this.prisma.courseEvent.findMany({
      where: {
        courseId: { in: courseIds },
        startsAt: { gte: from, lte: to },
      },
      orderBy: { startsAt: 'asc' },
      include: { course: { select: { id: true, title: true } } },
    });

    const lessonIds = [
      ...new Set(
        events
          .filter((e) => e.type === CourseEventType.LIVE && e.lessonId)
          .map((e) => e.lessonId as string),
      ),
    ];
    const lessons = lessonIds.length
      ? await this.prisma.lesson.findMany({
          where: { id: { in: lessonIds } },
          select: {
            id: true,
            type: true,
            videoSource: true,
            videoUrl: true,
            scheduledAt: true,
            contentUnlockDaysBefore: true,
            contentUnlockedForAll: true,
            module: { select: { courseId: true } },
          },
        })
      : [];

    const lessonById = new Map(lessons.map((l) => [l.id, l]));

    const byCourse = new Map<string, typeof lessons>();
    for (const l of lessons) {
      const list = byCourse.get(l.module.courseId) ?? [];
      list.push(l);
      byCourse.set(l.module.courseId, list);
    }

    const accessByLesson = new Map<string, boolean>();
    for (const [courseId, list] of byCourse) {
      const map = await this.lessonContent.evaluateMany(
        actor,
        list.map((l) => ({
          id: l.id,
          scheduledAt: l.scheduledAt,
          contentUnlockDaysBefore: l.contentUnlockDaysBefore,
          contentUnlockedForAll: l.contentUnlockedForAll,
        })),
        courseId,
      );
      for (const [id, a] of map) accessByLesson.set(id, a.open);
    }

    return events.map((e) => {
      const contentOpen =
        e.type === CourseEventType.LIVE && e.lessonId
          ? (accessByLesson.get(e.lessonId) ?? true)
          : true;
      const linked = e.lessonId ? lessonById.get(e.lessonId) : undefined;
      return {
        ...e,
        contentOpen,
        meetingUrl: contentOpen ? e.meetingUrl : null,
        lessonType: linked?.type ?? null,
        lessonHasVideo: !!(linked?.videoSource || linked?.videoUrl),
      };
    });
  }

  /**
   * Mirror LIVE event schedule onto the linked lesson (and clear old link).
   */
  private async syncLessonFromEvent(
    previous: {
      type: CourseEventType;
      lessonId: string | null;
    } | null,
    next: {
      type: CourseEventType;
      lessonId: string | null;
      startsAt: Date;
      meetingUrl: string | null;
    },
  ) {
    const prevLessonId =
      previous?.type === CourseEventType.LIVE ? previous.lessonId : null;
    const nextLessonId =
      next.type === CourseEventType.LIVE ? next.lessonId : null;

    if (prevLessonId && prevLessonId !== nextLessonId) {
      await this.prisma.lesson.updateMany({
        where: { id: prevLessonId },
        data: { scheduledAt: null, meetingUrl: null },
      });
    }

    if (nextLessonId) {
      await this.prisma.lesson.update({
        where: { id: nextLessonId },
        data: {
          scheduledAt: next.startsAt,
          meetingUrl: next.meetingUrl,
        },
      });
    }
  }

  private async assertCourseExists(courseId: string) {
    const c = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!c) throw new NotFoundException('Course not found');
  }

  private async validateLinks(
    courseId: string,
    lessonId?: string | null,
    assignmentId?: string | null,
  ) {
    if (lessonId) {
      const lesson = await this.prisma.lesson.findUnique({
        where: { id: lessonId },
        include: { module: { select: { courseId: true } } },
      });
      if (!lesson || lesson.module.courseId !== courseId) {
        throw new BadRequestException('lessonId does not belong to course');
      }
    }
    if (assignmentId) {
      const a = await this.prisma.assignment.findUnique({
        where: { id: assignmentId },
      });
      if (!a || a.courseId !== courseId) {
        throw new BadRequestException('assignmentId does not belong to course');
      }
    }
  }
}
