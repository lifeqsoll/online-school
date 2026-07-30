import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourseEventType } from '@prisma/client';
import { CourseAccessService } from '../enrollments/course-access.service';
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

    return this.prisma.courseEvent.create({
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
    await this.validateLinks(event.courseId, lessonId ?? undefined, assignmentId ?? undefined);

    const type = dto.type ?? event.type;
    return this.prisma.courseEvent.update({
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
  }

  async remove(actor: AuthUser, id: string) {
    const event = await this.prisma.courseEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    if (!(await this.access.canManageCourse(actor, event.courseId))) {
      throw new ForbiddenException('Cannot manage this course');
    }
    await this.prisma.courseEvent.delete({ where: { id } });
    return { ok: true };
  }

  async calendarMine(actor: AuthUser, from: Date, to: Date) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: actor.id, status: 'ACTIVE' },
      select: { courseId: true },
    });
    const courseIds = enrollments.map((e) => e.courseId);
    if (!courseIds.length) return [];
    return this.prisma.courseEvent.findMany({
      where: {
        courseId: { in: courseIds },
        startsAt: { gte: from, lte: to },
      },
      orderBy: { startsAt: 'asc' },
      include: { course: { select: { id: true, title: true } } },
    });
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
