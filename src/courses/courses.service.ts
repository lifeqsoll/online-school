import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, MembershipRole, Prisma, StoredFileOwnerType, VideoSource } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { CourseAccessService } from '../enrollments/course-access.service';
import {
  IMAGE_MIMES,
  MAX_PNG_PDF_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_MIMES,
} from '../files/files.mime';
import { LessonContentAccessService } from '../lessons/lesson-content-access.service';
import { classifyExternalVideoUrl } from '../lessons/video-url.util';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';
import { StorageService } from '../storage/storage.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';

type CourseRow = Prisma.CourseGetPayload<object>;

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly lessonContent: LessonContentAccessService,
  ) {}

  async list(user?: AuthUser, opts?: { managedOnly?: boolean }) {
    let rows: CourseRow[];
    if (!user) {
      if (opts?.managedOnly) return [];
      rows = await this.prisma.course.findMany({
        where: { isPublished: true },
        orderBy: { createdAt: 'desc' },
      });
      return Promise.all(rows.map((c) => this.present(c)));
    }
    if (user.realGlobalRole === 'ADMIN') {
      rows = await this.prisma.course.findMany({ orderBy: { createdAt: 'desc' } });
      return Promise.all(rows.map((c) => this.present(c)));
    }
    const memberships = await this.prisma.courseMembership.findMany({
      where: { userId: user.id, role: MembershipRole.CURATOR },
      select: { courseId: true },
    });
    const managedIds = memberships.map((m) => m.courseId);
    if (opts?.managedOnly) {
      rows = await this.prisma.course.findMany({
        where: { id: { in: managedIds } },
        orderBy: { createdAt: 'desc' },
      });
      return Promise.all(rows.map((c) => this.present(c)));
    }
    rows = await this.prisma.course.findMany({
      where: {
        OR: [{ isPublished: true }, { id: { in: managedIds } }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((c) => this.present(c)));
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

    if (canManage) return this.present(course, { withMaterials: true });

    if (hasAccess) {
      const published = {
        ...course,
        modules: course.modules.map((m) => ({
          ...m,
          lessons: m.lessons.filter((l) => l.isPublished),
        })),
      };
      const allLessons = published.modules.flatMap((m) => m.lessons);
      const accessMap = await this.lessonContent.evaluateMany(
        user!,
        allLessons.map((l) => ({
          id: l.id,
          scheduledAt: l.scheduledAt,
          contentUnlockDaysBefore: l.contentUnlockDaysBefore,
          contentUnlockedForAll: l.contentUnlockedForAll,
        })),
        course.id,
      );
      return this.present(
        {
          ...published,
          modules: published.modules.map((m) => ({
            ...m,
            lessons: m.lessons.map((l) => {
              const a = accessMap.get(l.id);
              const open = a?.open ?? true;
              if (open) {
                return {
                  ...l,
                  contentOpen: true,
                  unlocksAt: a?.unlocksAt ?? null,
                };
              }
              return {
                id: l.id,
                title: l.title,
                type: l.type,
                sortOrder: l.sortOrder,
                isPublished: l.isPublished,
                scheduledAt: l.scheduledAt,
                contentUnlockDaysBefore: l.contentUnlockDaysBefore,
                contentOpen: false,
                unlocksAt: a?.unlocksAt ?? null,
                content: null,
                meetingUrl: null,
                videoUrl: null,
                videoSource: null,
                storageKey: undefined,
              };
            }),
          })),
        },
        { withMaterials: true },
      );
    }

    return this.present(
      {
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
      },
      { withMaterials: true },
    );
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
    return this.present(course);
  }

  async update(actor: AuthUser, id: string, dto: UpdateCourseDto) {
    await this.requireManage(actor, id);
    const course = await this.prisma.course.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        catalogBody:
          dto.catalogBody === undefined
            ? undefined
            : dto.catalogBody.trim() || null,
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
    return this.present(course);
  }

  async remove(actor: AuthUser, id: string) {
    await this.requireManage(actor, id);
    const existing = await this.prisma.course.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Course not found');
    if (existing.coverStorageKey) {
      try {
        await this.storage.deleteObject(existing.coverStorageKey);
      } catch {
        /* ignore */
      }
    }
    if (existing.promoStorageKey) {
      try {
        await this.storage.deleteObject(existing.promoStorageKey);
      } catch {
        /* ignore */
      }
    }
    await this.prisma.course.delete({ where: { id } });
    await this.audit.append({
      action: AuditAction.COURSE_UPDATE,
      actorId: actor.realUserId,
      meta: { courseId: id, deleted: true },
    });
    return { ok: true };
  }

  async uploadCover(actor: AuthUser, id: string, file: Express.Multer.File) {
    await this.requireManage(actor, id);
    if (!file) throw new BadRequestException('file is required');
    const mime = file.mimetype || '';
    if (!IMAGE_MIMES.has(mime)) {
      throw new BadRequestException('Allowed: PNG, JPEG, WebP');
    }
    if (file.size > MAX_PNG_PDF_BYTES) {
      throw new BadRequestException('Cover exceeds 20 MB limit');
    }

    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');

    const ext =
      mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const key = `courses/${id}/cover/${randomUUID()}.${ext}`;
    await this.storage.uploadObject(key, file.buffer, mime);

    if (course.coverStorageKey) {
      try {
        await this.storage.deleteObject(course.coverStorageKey);
      } catch {
        /* ignore */
      }
    }

    const updated = await this.prisma.course.update({
      where: { id },
      data: { coverStorageKey: key },
    });
    return this.present(updated);
  }

  async removeCover(actor: AuthUser, id: string) {
    await this.requireManage(actor, id);
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.coverStorageKey) {
      try {
        await this.storage.deleteObject(course.coverStorageKey);
      } catch {
        /* ignore */
      }
    }
    const updated = await this.prisma.course.update({
      where: { id },
      data: { coverStorageKey: null },
    });
    return this.present(updated, { withMaterials: true });
  }

  async setPromoExternal(actor: AuthUser, id: string, url: string) {
    await this.requireManage(actor, id);
    let classified;
    try {
      classified = classifyExternalVideoUrl(url.trim());
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.promoStorageKey) {
      try {
        await this.storage.deleteObject(course.promoStorageKey);
      } catch {
        /* ignore */
      }
    }
    const updated = await this.prisma.course.update({
      where: { id },
      data: {
        promoVideoSource: VideoSource.EXTERNAL_URL,
        promoVideoUrl: classified.url,
        promoStorageKey: null,
      },
    });
    return this.present(updated, { withMaterials: true });
  }

  async uploadPromoVideo(actor: AuthUser, id: string, file: Express.Multer.File) {
    await this.requireManage(actor, id);
    if (!file) throw new BadRequestException('file is required');
    const mime = file.mimetype || '';
    if (!VIDEO_MIMES.has(mime)) {
      throw new BadRequestException('Allowed: MP4, WebM, MOV');
    }
    if (file.size > MAX_VIDEO_BYTES) {
      throw new BadRequestException('Video exceeds 200 MB limit');
    }
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');

    const ext =
      mime === 'video/webm' ? 'webm' : mime === 'video/quicktime' ? 'mov' : 'mp4';
    const key = `courses/${id}/promo/${randomUUID()}.${ext}`;
    await this.storage.uploadObject(key, file.buffer, mime);

    if (course.promoStorageKey) {
      try {
        await this.storage.deleteObject(course.promoStorageKey);
      } catch {
        /* ignore */
      }
    }

    const updated = await this.prisma.course.update({
      where: { id },
      data: {
        promoVideoSource: VideoSource.UPLOADED,
        promoVideoUrl: null,
        promoStorageKey: key,
      },
    });
    return this.present(updated, { withMaterials: true });
  }

  async removePromoVideo(actor: AuthUser, id: string) {
    await this.requireManage(actor, id);
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.promoStorageKey) {
      try {
        await this.storage.deleteObject(course.promoStorageKey);
      } catch {
        /* ignore */
      }
    }
    const updated = await this.prisma.course.update({
      where: { id },
      data: {
        promoVideoSource: null,
        promoVideoUrl: null,
        promoStorageKey: null,
      },
    });
    return this.present(updated, { withMaterials: true });
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

  async removeCurator(actor: AuthUser, courseId: string, userId: string) {
    if (actor.realGlobalRole !== 'ADMIN') {
      throw new ForbiddenException('Only admin can remove curators');
    }
    await this.get(courseId);
    const membership = await this.prisma.courseMembership.findUnique({
      where: { courseId_userId: { courseId, userId } },
    });
    if (!membership || membership.role !== MembershipRole.CURATOR) {
      throw new NotFoundException('Curator membership not found');
    }
    await this.prisma.courseMembership.delete({
      where: { courseId_userId: { courseId, userId } },
    });
    return { ok: true };
  }

  async requireManage(actor: AuthUser, courseId: string) {
    const ok = await this.access.canManageCourse(actor, courseId);
    if (!ok) throw new ForbiddenException('Cannot manage this course');
  }

  async presentCourseCover<T extends { coverStorageKey?: string | null }>(
    course: T,
  ) {
    return this.present(course);
  }

  private async present<
    T extends {
      id?: string;
      coverStorageKey?: string | null;
      promoStorageKey?: string | null;
      promoVideoSource?: VideoSource | null;
      promoVideoUrl?: string | null;
    },
  >(
    course: T,
    opts?: { withMaterials?: boolean },
  ): Promise<
    Omit<T, 'coverStorageKey' | 'promoStorageKey'> & {
      coverUrl: string | null;
      promoPlayback: { kind: string; url: string } | null;
      catalogMaterials?: Array<{
        id: string;
        originalName: string;
        mimeType: string;
        sizeBytes: number;
        url: string;
      }>;
    }
  > {
    let coverUrl: string | null = null;
    if (course.coverStorageKey) {
      try {
        coverUrl = await this.storage.getSignedGetUrl(course.coverStorageKey);
      } catch {
        coverUrl = null;
      }
    }

    let promoPlayback: { kind: string; url: string } | null = null;
    if (course.promoVideoSource === VideoSource.UPLOADED && course.promoStorageKey) {
      try {
        const url = await this.storage.getSignedGetUrl(course.promoStorageKey);
        promoPlayback = { kind: 'direct', url };
      } catch {
        promoPlayback = null;
      }
    } else if (
      course.promoVideoSource === VideoSource.EXTERNAL_URL &&
      course.promoVideoUrl
    ) {
      try {
        const c = classifyExternalVideoUrl(course.promoVideoUrl);
        promoPlayback = { kind: c.kind, url: c.url };
      } catch {
        promoPlayback = { kind: 'direct', url: course.promoVideoUrl };
      }
    }

    let catalogMaterials:
      | Array<{
          id: string;
          originalName: string;
          mimeType: string;
          sizeBytes: number;
          url: string;
        }>
      | undefined;
    if (opts?.withMaterials && course.id) {
      const rows = await this.prisma.storedFile.findMany({
        where: {
          ownerType: StoredFileOwnerType.COURSE_MATERIAL,
          ownerId: course.id,
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          storageKey: true,
        },
      });
      catalogMaterials = await Promise.all(
        rows.map(async (r) => {
          let url = '';
          try {
            url = await this.storage.getSignedGetUrl(r.storageKey);
          } catch {
            url = '';
          }
          return {
            id: r.id,
            originalName: r.originalName,
            mimeType: r.mimeType,
            sizeBytes: r.sizeBytes,
            url,
          };
        }),
      );
    }

    const {
      coverStorageKey: _c,
      promoStorageKey: _p,
      ...rest
    } = course as T & {
      coverStorageKey?: string | null;
      promoStorageKey?: string | null;
    };
    return {
      ...(rest as Omit<T, 'coverStorageKey' | 'promoStorageKey'>),
      coverUrl,
      promoPlayback,
      ...(catalogMaterials ? { catalogMaterials } : {}),
    };
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
