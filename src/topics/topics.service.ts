import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourseAccessService } from '../enrollments/course-access.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'topic';
}

@Injectable()
export class TopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly outbox: OutboxService,
  ) {}

  async create(
    actor: AuthUser,
    courseId: string,
    dto: { name: string; sortOrder?: number },
  ) {
    await this.requireManage(actor, courseId);
    let slug = slugify(dto.name);
    const clash = await this.prisma.topic.findUnique({
      where: { courseId_slug: { courseId, slug } },
    });
    if (clash) slug = `${slug}-${Date.now().toString(36)}`;

    return this.prisma.$transaction(async (tx) => {
      const topic = await tx.topic.create({
        data: {
          courseId,
          name: dto.name,
          slug,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      await this.outbox.enqueue(tx, 'TOPIC_UPSERT', {
        id: topic.id,
        courseId,
        name: topic.name,
      });
      return topic;
    });
  }

  async list(actor: AuthUser, courseId: string) {
    if (!(await this.access.hasContentAccess(actor, courseId))) {
      throw new ForbiddenException();
    }
    return this.prisma.topic.findMany({
      where: { courseId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async update(
    actor: AuthUser,
    id: string,
    dto: { name?: string; sortOrder?: number },
  ) {
    const topic = await this.prisma.topic.findUnique({ where: { id } });
    if (!topic) throw new NotFoundException();
    await this.requireManage(actor, topic.courseId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.topic.update({
        where: { id },
        data: { name: dto.name, sortOrder: dto.sortOrder },
      });
      await this.outbox.enqueue(tx, 'TOPIC_UPSERT', {
        id: updated.id,
        courseId: updated.courseId,
        name: updated.name,
      });
      return updated;
    });
  }

  async remove(actor: AuthUser, id: string) {
    const topic = await this.prisma.topic.findUnique({ where: { id } });
    if (!topic) throw new NotFoundException();
    await this.requireManage(actor, topic.courseId);
    await this.prisma.topic.delete({ where: { id } });
    return { ok: true };
  }

  async setLessonTopics(actor: AuthUser, lessonId: string, topicIds: string[]) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: true },
    });
    if (!lesson) throw new NotFoundException();
    const courseId = lesson.module.courseId;
    await this.requireManage(actor, courseId);
    await this.validateTopics(courseId, topicIds);

    return this.prisma.$transaction(async (tx) => {
      await tx.lessonTopic.deleteMany({ where: { lessonId } });
      if (topicIds.length) {
        await tx.lessonTopic.createMany({
          data: topicIds.map((topicId) => ({ lessonId, topicId })),
        });
      }
      await this.outbox.enqueue(tx, 'LESSON_TOPIC_SET', {
        lessonId,
        courseId,
        topicIds,
      });
      return { lessonId, topicIds };
    });
  }

  async setAssignmentTopics(
    actor: AuthUser,
    assignmentId: string,
    topicIds: string[],
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new NotFoundException();
    await this.requireManage(actor, assignment.courseId);
    await this.validateTopics(assignment.courseId, topicIds);

    return this.prisma.$transaction(async (tx) => {
      await tx.assignmentTopic.deleteMany({ where: { assignmentId } });
      if (topicIds.length) {
        await tx.assignmentTopic.createMany({
          data: topicIds.map((topicId) => ({ assignmentId, topicId })),
        });
      }
      await this.outbox.enqueue(tx, 'ASSIGNMENT_TOPIC_SET', {
        assignmentId,
        courseId: assignment.courseId,
        topicIds,
      });
      return { assignmentId, topicIds };
    });
  }

  private async validateTopics(courseId: string, topicIds: string[]) {
    if (!topicIds.length) return;
    const count = await this.prisma.topic.count({
      where: { courseId, id: { in: topicIds } },
    });
    if (count !== topicIds.length) {
      throw new BadRequestException('Invalid topicIds for course');
    }
  }

  private async requireManage(actor: AuthUser, courseId: string) {
    if (!(await this.access.canManageCourse(actor, courseId))) {
      throw new ForbiddenException();
    }
  }
}
