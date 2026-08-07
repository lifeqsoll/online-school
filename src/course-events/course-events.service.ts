import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourseEventType, GlobalRole, SubmissionStatus } from '@prisma/client';
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

    await this.backfillLessonLiveEvents([courseId], from, to, actor.realUserId);
    await this.backfillAssignmentDeadlines(
      [courseId],
      from,
      to,
      actor.realUserId,
    );

    const events = await this.prisma.courseEvent.findMany({
      where: { courseId, startsAt: { gte: from, lte: to } },
      orderBy: { startsAt: 'asc' },
      include: { course: { select: { id: true, title: true } } },
    });
    return this.presentCalendarEvents(actor, events);
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
          type === CourseEventType.LIVE
            ? dto.meetingUrl === undefined
              ? undefined
              : dto.meetingUrl
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
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid from/to');
    }

    const courseIds = await this.resolveCalendarCourseIds(actor, from, to);
    if (!courseIds.length) return [];

    await this.backfillLessonLiveEvents(courseIds, from, to, actor.realUserId);
    await this.backfillAssignmentDeadlines(
      courseIds,
      from,
      to,
      actor.realUserId,
    );

    const events = await this.prisma.courseEvent.findMany({
      where: {
        courseId: { in: courseIds },
        startsAt: { gte: from, lte: to },
      },
      orderBy: { startsAt: 'asc' },
      include: { course: { select: { id: true, title: true } } },
    });

    return this.presentCalendarEvents(actor, events);
  }

  /** Enrollments + curator memberships; ADMIN also sees courses with activity in range. */
  private async resolveCalendarCourseIds(
    actor: AuthUser,
    from: Date,
    to: Date,
  ): Promise<string[]> {
    const [enrollments, memberships] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { userId: actor.id, status: 'ACTIVE' },
        select: { courseId: true },
      }),
      this.prisma.courseMembership.findMany({
        where: { userId: actor.id },
        select: { courseId: true },
      }),
    ]);

    const ids = new Set<string>([
      ...enrollments.map((e) => e.courseId),
      ...memberships.map((m) => m.courseId),
    ]);

    if (actor.realGlobalRole === GlobalRole.ADMIN) {
      const [eventCourses, lessonCourses] = await Promise.all([
        this.prisma.courseEvent.findMany({
          where: { startsAt: { gte: from, lte: to } },
          select: { courseId: true },
          distinct: ['courseId'],
        }),
        this.prisma.lesson.findMany({
          where: { scheduledAt: { gte: from, lte: to } },
          select: { module: { select: { courseId: true } } },
        }),
      ]);
      for (const e of eventCourses) ids.add(e.courseId);
      for (const l of lessonCourses) ids.add(l.module.courseId);
    }

    return [...ids];
  }

  private async presentCalendarEvents(
    actor: AuthUser,
    events: Array<{
      id: string;
      courseId: string;
      title: string;
      description: string | null;
      type: CourseEventType;
      startsAt: Date;
      endsAt: Date | null;
      meetingUrl: string | null;
      lessonId: string | null;
      assignmentId: string | null;
      createdById: string;
      createdAt: Date;
      updatedAt: Date;
      course?: { id: string; title: string } | null;
    }>,
  ) {
    const deduped = this.dedupeDeadlineEvents(events);

    const lessonIds = [
      ...new Set(
        deduped
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

    const canManageByCourse = new Map<string, boolean>();
    const assignments = lessonIds.length
      ? await this.prisma.assignment.findMany({
          where: { lessonId: { in: lessonIds } },
          select: {
            id: true,
            title: true,
            lessonId: true,
            isPublished: true,
            courseId: true,
          },
          orderBy: { sortOrder: 'asc' },
        })
      : [];

    const hwByLesson = new Map<
      string,
      Array<{ id: string; title: string; done: boolean }>
    >();
    const visibleAsgIds: string[] = [];
    for (const a of assignments) {
      if (!a.lessonId) continue;
      let include = a.isPublished;
      if (!include) {
        let canManage = canManageByCourse.get(a.courseId);
        if (canManage === undefined) {
          canManage = await this.access.canManageCourse(actor, a.courseId);
          canManageByCourse.set(a.courseId, canManage);
        }
        include = canManage;
      }
      if (!include) continue;
      visibleAsgIds.push(a.id);
      const list = hwByLesson.get(a.lessonId) ?? [];
      list.push({ id: a.id, title: a.title, done: false });
      hwByLesson.set(a.lessonId, list);
    }

    const deadlineAsgIds = deduped
      .filter((e) => e.type === CourseEventType.DEADLINE && e.assignmentId)
      .map((e) => e.assignmentId as string);
    const statusAsgIds = [...new Set([...visibleAsgIds, ...deadlineAsgIds])];
    const doneIds = new Set<string>();
    if (statusAsgIds.length) {
      const submitted = await this.prisma.submission.findMany({
        where: {
          userId: actor.id,
          assignmentId: { in: statusAsgIds },
          status: { not: SubmissionStatus.IN_PROGRESS },
        },
        select: { assignmentId: true },
        distinct: ['assignmentId'],
      });
      for (const s of submitted) doneIds.add(s.assignmentId);
    }
    for (const [, list] of hwByLesson) {
      for (const item of list) {
        item.done = doneIds.has(item.id);
      }
    }

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

    return deduped.map((e) => {
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
        assignmentDone:
          e.type === CourseEventType.DEADLINE && e.assignmentId
            ? doneIds.has(e.assignmentId)
            : false,
        linkedAssignments:
          e.type === CourseEventType.LIVE && e.lessonId
            ? (hwByLesson.get(e.lessonId) ?? [])
            : [],
      };
    });
  }

  /** Keep one DEADLINE per assignmentId. */
  private dedupeDeadlineEvents<
    T extends { id: string; type: CourseEventType; assignmentId: string | null },
  >(events: T[]): T[] {
    const seen = new Set<string>();
    return events.filter((e) => {
      if (e.type !== CourseEventType.DEADLINE || !e.assignmentId) return true;
      if (seen.has(e.assignmentId)) return false;
      seen.add(e.assignmentId);
      return true;
    });
  }

  private async backfillLessonLiveEvents(
    courseIds: string[],
    from: Date,
    to: Date,
    actorId: string,
  ) {
    const lessons = await this.prisma.lesson.findMany({
      where: {
        module: { courseId: { in: courseIds } },
        scheduledAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        endsAt: true,
        meetingUrl: true,
        module: { select: { courseId: true } },
      },
    });
    if (!lessons.length) return;

    const existing = await this.prisma.courseEvent.findMany({
      where: {
        lessonId: { in: lessons.map((l) => l.id) },
        type: CourseEventType.LIVE,
      },
      select: { lessonId: true },
    });
    const have = new Set(existing.map((e) => e.lessonId));

    for (const lesson of lessons) {
      if (!lesson.scheduledAt || have.has(lesson.id)) continue;
      const endsAt =
        lesson.endsAt && lesson.endsAt > lesson.scheduledAt
          ? lesson.endsAt
          : new Date(lesson.scheduledAt.getTime() + 60 * 60 * 1000);
      await this.prisma.courseEvent.create({
        data: {
          courseId: lesson.module.courseId,
          title: lesson.title,
          type: CourseEventType.LIVE,
          startsAt: lesson.scheduledAt,
          endsAt,
          meetingUrl: lesson.meetingUrl,
          lessonId: lesson.id,
          createdById: actorId,
        },
      });
    }
  }

  private async backfillAssignmentDeadlines(
    courseIds: string[],
    from: Date,
    to: Date,
    actorId: string,
  ) {
    const assignments = await this.prisma.assignment.findMany({
      where: {
        courseId: { in: courseIds },
        OR: [
          { dueAt: { gte: from, lte: to } },
          {
            lessonId: { not: null },
            lesson: { scheduledAt: { gte: from, lte: to } },
          },
        ],
      },
      select: {
        id: true,
        title: true,
        courseId: true,
        dueAt: true,
        lessonId: true,
        lesson: { select: { scheduledAt: true } },
      },
    });
    if (!assignments.length) return;

    const existing = await this.prisma.courseEvent.findMany({
      where: {
        assignmentId: { in: assignments.map((a) => a.id) },
        type: CourseEventType.DEADLINE,
      },
      select: { id: true, assignmentId: true },
      orderBy: { createdAt: 'asc' },
    });
    const have = new Set<string>();
    const extras: string[] = [];
    for (const e of existing) {
      if (!e.assignmentId) continue;
      if (have.has(e.assignmentId)) extras.push(e.id);
      else have.add(e.assignmentId);
    }
    if (extras.length) {
      await this.prisma.courseEvent.deleteMany({
        where: { id: { in: extras } },
      });
    }

    for (const a of assignments) {
      if (have.has(a.id)) continue;
      const startsAt = a.dueAt ?? a.lesson?.scheduledAt ?? null;
      if (!startsAt) continue;
      if (startsAt < from || startsAt > to) continue;
      await this.prisma.courseEvent.create({
        data: {
          courseId: a.courseId,
          title: `ДЗ: ${a.title}`,
          type: CourseEventType.DEADLINE,
          startsAt,
          endsAt: startsAt,
          assignmentId: a.id,
          lessonId: a.lessonId,
          createdById: actorId,
        },
      });
    }
  }

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
