import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, MembershipRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CourseAccessService } from '../enrollments/course-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly audit: AuditService,
  ) {}

  async list(user?: AuthUser, opts?: { managedOnly?: boolean }) {
    if (!user) {
      if (opts?.managedOnly) return [];
      return this.prisma.course.findMany({
        where: { isPublished: true },
        orderBy: { createdAt: 'desc' },
      });
    }
    if (user.realGlobalRole === 'ADMIN') {
      return this.prisma.course.findMany({ orderBy: { createdAt: 'desc' } });
    }
    const memberships = await this.prisma.courseMembership.findMany({
      where: { userId: user.id, role: MembershipRole.CURATOR },
      select: { courseId: true },
    });
    const managedIds = memberships.map((m) => m.courseId);
    if (opts?.managedOnly) {
      return this.prisma.course.findMany({
        where: { id: { in: managedIds } },
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.course.findMany({
      where: {
        OR: [{ isPublished: true }, { id: { in: managedIds } }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(idOrSlug: string) {
    const course = await this.prisma.course.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        modules: {
          orderBy: { sortOrder: 'asc' },
          include: {
            lessons: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async getForViewer(user: AuthUser | undefined, idOrSlug: string) {
    const course = await this.get(idOrSlug);
    const canManage =
      !!user && (await this.access.canManageCourse(user, course.id));
    const hasAccess =
      !!user && (await this.access.hasContentAccess(user, course.id));

    if (!course.isPublished && !canManage) {
      throw new NotFoundException('Course not found');
    }

    if (canManage) return course;

    if (hasAccess) {
      return {
        ...course,
        modules: course.modules.map((m) => ({
          ...m,
          lessons: m.lessons.filter((l) => l.isPublished),
        })),
      };
    }

    return {
      ...course,
      modules: course.modules.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        sortOrder: m.sortOrder,
        lessons: m.lessons
          .filter((l) => l.isPublished)
          .map((l) => ({
            id: l.id,
            title: l.title,
            type: l.type,
            sortOrder: l.sortOrder,
            isPublished: l.isPublished,
          })),
      })),
    };
  }

  async create(actor: AuthUser, dto: CreateCourseDto) {
    const canCreate =
      actor.realGlobalRole === 'ADMIN' ||
      !!(await this.prisma.courseMembership.findFirst({
        where: { userId: actor.realUserId, role: MembershipRole.CURATOR },
      }));

    if (!canCreate) {
      throw new ForbiddenException('Only admins or curators can create courses');
    }

    const slug = await this.uniqueSlug(dto.title);
    const course = await this.prisma.course.create({
      data: {
        title: dto.title,
        slug,
        description: dto.description,
        priceCents: dto.priceCents ?? 0,
        currency: dto.currency ?? 'RUB',
        isPublished: dto.isPublished ?? false,
        memberships: {
          create: {
            userId: actor.realUserId,
            role: MembershipRole.CURATOR,
          },
        },
      },
    });

    await this.audit.append({
      action: AuditAction.COURSE_CREATE,
      actorId: actor.realUserId,
      meta: { courseId: course.id },
    });
    return course;
  }

  async update(actor: AuthUser, id: string, dto: UpdateCourseDto) {
    await this.requireManage(actor, id);
    const course = await this.prisma.course.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priceCents: dto.priceCents,
        currency: dto.currency,
        isPublished: dto.isPublished,
      },
    });
    await this.audit.append({
      action: AuditAction.COURSE_UPDATE,
      actorId: actor.realUserId,
      meta: { courseId: id },
    });
    return course;
  }

  async remove(actor: AuthUser, id: string) {
    await this.requireManage(actor, id);
    await this.prisma.course.delete({ where: { id } });
    await this.audit.append({
      action: AuditAction.COURSE_UPDATE,
      actorId: actor.realUserId,
      meta: { courseId: id, deleted: true },
    });
    return { ok: true };
  }

  async listCurators(actor: AuthUser, courseId: string) {
    if (actor.realGlobalRole !== 'ADMIN') {
      throw new ForbiddenException('Only admin can list curators');
    }
    await this.get(courseId);
    return this.prisma.courseMembership.findMany({
      where: { courseId, role: MembershipRole.CURATOR },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async assignCurator(actor: AuthUser, courseId: string, userId: string) {
    if (actor.realGlobalRole !== 'ADMIN') {
      throw new ForbiddenException('Only admin can assign curators');
    }
    await this.get(courseId);
    return this.prisma.courseMembership.upsert({
      where: { courseId_userId: { courseId, userId } },
      create: { courseId, userId, role: MembershipRole.CURATOR },
      update: { role: MembershipRole.CURATOR },
    });
  }

  async requireManage(actor: AuthUser, courseId: string) {
    const ok = await this.access.canManageCourse(actor, courseId);
    if (!ok) throw new ForbiddenException('Cannot manage this course');
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base =
      title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9а-яё]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'course';
    let slug = base;
    let i = 0;
    while (await this.prisma.course.findUnique({ where: { slug } })) {
      i += 1;
      slug = `${base}-${i}`;
    }
    return slug;
  }
}
