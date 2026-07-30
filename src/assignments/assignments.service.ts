import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentScope,
  AuditAction,
  Prisma,
  QuestionType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CourseAccessService } from '../enrollments/course-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';
import {
  CreateAssignmentDto,
  QuestionDto,
  ReplaceQuestionsDto,
  UpdateAssignmentDto,
} from './dto/assignment.dto';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: AuthUser, courseId: string, dto: CreateAssignmentDto) {
    await this.requireManage(actor, courseId);
    const resolved = await this.resolveScope(courseId, dto);

    const assignment = await this.prisma.assignment.create({
      data: {
        courseId: resolved.courseId,
        scope: dto.scope,
        lessonId: resolved.lessonId,
        moduleId: resolved.moduleId,
        title: dto.title,
        description: dto.description,
        maxXp: dto.maxXp,
        maxAttempts: dto.maxAttempts,
        isPublished: dto.isPublished ?? false,
        sortOrder: dto.sortOrder ?? 0,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        responseMode: dto.responseMode ?? undefined,
        questions: dto.questions?.length
          ? { create: dto.questions.map((q, i) => this.questionData(q, i)) }
          : undefined,
      },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
    });

    await this.audit.append({
      actorId: actor.realUserId,
      action: AuditAction.ASSIGNMENT_CREATE,
      meta: { assignmentId: assignment.id, courseId },
    });

    return this.present(assignment, true);
  }

  async list(actor: AuthUser, courseId: string) {
    const manage = await this.access.canManageCourse(actor, courseId);
    if (!manage) {
      const ok = await this.access.hasContentAccess(actor, courseId);
      if (!ok) throw new ForbiddenException();
    }
    const rows = await this.prisma.assignment.findMany({
      where: manage ? { courseId } : { courseId, isPublished: true },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.present(r, manage));
  }

  async get(actor: AuthUser, id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    const manage = await this.access.canManageCourse(actor, assignment.courseId);
    if (!manage) {
      if (!assignment.isPublished) throw new NotFoundException('Assignment not found');
      const ok = await this.access.hasContentAccess(actor, assignment.courseId);
      if (!ok) throw new ForbiddenException();
    }
    return this.present(assignment, manage);
  }

  async update(actor: AuthUser, id: string, dto: UpdateAssignmentDto) {
    const existing = await this.prisma.assignment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Assignment not found');
    await this.requireManage(actor, existing.courseId);

    const assignment = await this.prisma.assignment.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        maxXp: dto.maxXp,
        maxAttempts: dto.maxAttempts === null ? null : dto.maxAttempts,
        isPublished: dto.isPublished,
        sortOrder: dto.sortOrder,
        dueAt:
          dto.dueAt === null
            ? null
            : dto.dueAt
              ? new Date(dto.dueAt)
              : undefined,
        responseMode: dto.responseMode,
      },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
    });

    await this.audit.append({
      actorId: actor.realUserId,
      action: AuditAction.ASSIGNMENT_UPDATE,
      meta: { assignmentId: id },
    });

    return this.present(assignment, true);
  }

  async remove(actor: AuthUser, id: string) {
    const existing = await this.prisma.assignment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Assignment not found');
    await this.requireManage(actor, existing.courseId);
    await this.prisma.assignment.delete({ where: { id } });
    await this.audit.append({
      actorId: actor.realUserId,
      action: AuditAction.ASSIGNMENT_UPDATE,
      meta: { assignmentId: id, deleted: true },
    });
    return { ok: true };
  }

  async replaceQuestions(
    actor: AuthUser,
    id: string,
    dto: ReplaceQuestionsDto,
  ) {
    const existing = await this.prisma.assignment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Assignment not found');
    await this.requireManage(actor, existing.courseId);

    const count = await this.prisma.submission.count({
      where: { assignmentId: id },
    });
    if (count > 0) {
      throw new ConflictException(
        'Cannot replace questions after submissions exist',
      );
    }

    const assignment = await this.prisma.$transaction(async (tx) => {
      await tx.question.deleteMany({ where: { assignmentId: id } });
      await tx.question.createMany({
        data: dto.questions.map((q, i) => ({
          assignmentId: id,
          ...this.questionData(q, i),
        })),
      });
      return tx.assignment.findUniqueOrThrow({
        where: { id },
        include: { questions: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    return this.present(assignment, true);
  }

  private questionData(q: QuestionDto, index: number) {
    if (q.type === QuestionType.CHOICE && (!q.options || !q.correctKeys)) {
      throw new BadRequestException('CHOICE requires options and correctKeys');
    }
    if (q.type === QuestionType.SHORT && !q.correctKeys?.length) {
      throw new BadRequestException('SHORT requires correctKeys');
    }
    return {
      type: q.type,
      prompt: q.prompt,
      sortOrder: q.sortOrder ?? index,
      points: q.points ?? 1,
      options: q.options ?? Prisma.JsonNull,
      correctKeys: q.correctKeys ?? Prisma.JsonNull,
      shortMatch: q.shortMatch,
      numberTolerance:
        q.numberTolerance !== undefined
          ? new Prisma.Decimal(q.numberTolerance)
          : undefined,
    };
  }

  private async resolveScope(courseId: string, dto: CreateAssignmentDto) {
    if (dto.scope === AssignmentScope.COURSE) {
      if (dto.lessonId || dto.moduleId) {
        throw new BadRequestException('COURSE scope must not set lesson/module');
      }
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
      });
      if (!course) throw new NotFoundException('Course not found');
      return { courseId, lessonId: null as string | null, moduleId: null as string | null };
    }

    if (dto.scope === AssignmentScope.MODULE) {
      if (!dto.moduleId) throw new BadRequestException('moduleId required');
      const mod = await this.prisma.courseModule.findUnique({
        where: { id: dto.moduleId },
      });
      if (!mod || mod.courseId !== courseId) {
        throw new BadRequestException('moduleId must belong to course');
      }
      return { courseId, lessonId: null, moduleId: dto.moduleId };
    }

    if (!dto.lessonId) throw new BadRequestException('lessonId required');
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: dto.lessonId },
      include: { module: true },
    });
    if (!lesson || lesson.module.courseId !== courseId) {
      throw new BadRequestException('lessonId must belong to course');
    }
    return {
      courseId,
      lessonId: dto.lessonId,
      moduleId: null,
    };
  }

  private async requireManage(actor: AuthUser, courseId: string) {
    if (!(await this.access.canManageCourse(actor, courseId))) {
      throw new ForbiddenException();
    }
  }

  private present(
    assignment: {
      questions?: Array<Record<string, unknown> & { correctKeys?: unknown }>;
      [key: string]: unknown;
    },
    includeKeys: boolean,
  ) {
    const questions = (assignment.questions ?? []).map((q) => {
      if (includeKeys) return q;
      const { correctKeys: _, ...rest } = q;
      return rest;
    });
    return { ...assignment, questions };
  }
}
