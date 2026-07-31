import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, CourseEventType, EnrollmentStatus, LessonType, VideoSource } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CourseAccessService } from '../enrollments/course-access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';
import { StorageService } from '../storage/storage.service';
import {
  CreateLessonDto,
  ExternalVideoDto,
  UpdateLessonDto,
} from './dto/lesson.dto';
import { LessonContentAccessService } from './lesson-content-access.service';
import { classifyExternalVideoUrl } from './video-url.util';

@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly contentAccess: LessonContentAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(actor: AuthUser, moduleId: string, dto: CreateLessonDto) {
    const mod = await this.prisma.courseModule.findUnique({
      where: { id: moduleId },
    });
    if (!mod) throw new NotFoundException('Module not found');
    await this.requireManage(actor, mod.courseId);
    const lesson = await this.prisma.lesson.create({
      data: {
        moduleId,
        title: dto.title,
        type: dto.type,
        content: dto.content,
        sortOrder: dto.sortOrder ?? 0,
        isPublished: dto.isPublished ?? false,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        meetingUrl: dto.meetingUrl === undefined ? null : dto.meetingUrl,
        contentUnlockDaysBefore: dto.contentUnlockDaysBefore ?? 7,
        contentUnlockedForAll: dto.contentUnlockedForAll ?? false,
      },
    });
    await this.syncCalendarEvent(lesson, mod.courseId, actor.realUserId);
    return lesson;
  }

  async update(actor: AuthUser, id: string, dto: UpdateLessonDto) {
    const lesson = await this.getLessonWithCourse(id);
    await this.requireManage(actor, lesson.module.courseId);

    const data: Record<string, unknown> = {
      title: dto.title,
      type: dto.type,
      content: dto.content,
      sortOrder: dto.sortOrder,
      isPublished: dto.isPublished,
    };

    if (dto.scheduledAt !== undefined) {
      data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    }
    if (dto.meetingUrl !== undefined) {
      data.meetingUrl = dto.meetingUrl === '' ? null : dto.meetingUrl;
    }
    if (dto.contentUnlockDaysBefore !== undefined) {
      data.contentUnlockDaysBefore = dto.contentUnlockDaysBefore;
    }
    if (dto.contentUnlockedForAll !== undefined) {
      data.contentUnlockedForAll = dto.contentUnlockedForAll;
    }

    const wasUnlocked = lesson.contentUnlockedForAll;
    const updated = await this.prisma.lesson.update({
      where: { id },
      data,
    });
    await this.syncCalendarEvent(
      updated,
      lesson.module.courseId,
      actor.realUserId,
    );
    await this.audit.append({
      action: AuditAction.LESSON_UPDATE,
      actorId: actor.realUserId,
      meta: { lessonId: id },
    });
    if (!wasUnlocked && updated.contentUnlockedForAll) {
      await this.notifyLessonOpenedToEnrolled(
        lesson.module.courseId,
        id,
        updated.title,
      );
    }
    return updated;
  }

  async remove(actor: AuthUser, id: string) {
    const lesson = await this.getLessonWithCourse(id);
    await this.requireManage(actor, lesson.module.courseId);
    await this.prisma.courseEvent.deleteMany({
      where: { lessonId: id, type: CourseEventType.LIVE },
    });
    await this.prisma.lesson.delete({ where: { id } });
    await this.audit.append({
      action: AuditAction.LESSON_UPDATE,
      actorId: actor.realUserId,
      meta: { lessonId: id, deleted: true },
    });
    return { ok: true };
  }

  async getOne(actor: AuthUser, id: string) {
    const lesson = await this.getLessonWithCourse(id);
    const access = await this.contentAccess.evaluate(actor, id);
    const canManage = await this.access.canManageCourse(
      actor,
      lesson.module.courseId,
    );

    const base = {
      id: lesson.id,
      title: lesson.title,
      type: lesson.type,
      isPublished: lesson.isPublished,
      scheduledAt: lesson.scheduledAt,
      contentUnlockDaysBefore: lesson.contentUnlockDaysBefore,
      contentUnlockedForAll: lesson.contentUnlockedForAll,
      moduleId: lesson.moduleId,
      courseId: lesson.module.courseId,
      contentOpen: access.open,
      unlocksAt: access.unlocksAt,
      grantedToYou: access.grantedToYou,
    };

    if (canManage || access.open) {
      return {
        ...base,
        content: lesson.content,
        meetingUrl: lesson.meetingUrl,
        videoUrl: lesson.videoUrl,
        videoSource: lesson.videoSource,
        hasVideo: !!lesson.videoSource,
      };
    }

    return {
      ...base,
      content: null,
      meetingUrl: null,
      videoUrl: null,
      videoSource: null,
      hasVideo: !!lesson.videoSource,
    };
  }

  async setContentUnlockedForAll(
    actor: AuthUser,
    id: string,
    unlocked: boolean,
  ) {
    const lesson = await this.getLessonWithCourse(id);
    await this.requireManage(actor, lesson.module.courseId);
    const wasUnlocked = lesson.contentUnlockedForAll;
    const updated = await this.prisma.lesson.update({
      where: { id },
      data: { contentUnlockedForAll: unlocked },
    });
    if (unlocked && !wasUnlocked) {
      await this.notifyLessonOpenedToEnrolled(
        lesson.module.courseId,
        id,
        lesson.title,
      );
    }
    return updated;
  }

  async grantContent(actor: AuthUser, id: string, userId: string) {
    const lesson = await this.getLessonWithCourse(id);
    await this.requireManage(actor, lesson.module.courseId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.isActive) throw new NotFoundException('User not found');
    const enrolled = await this.prisma.enrollment.findUnique({
      where: {
        courseId_userId: {
          courseId: lesson.module.courseId,
          userId,
        },
      },
    });
    if (!enrolled) {
      throw new BadRequestException('User is not enrolled in this course');
    }
    const existing = await this.prisma.lessonContentGrant.findUnique({
      where: { lessonId_userId: { lessonId: id, userId } },
    });
    const grant = await this.prisma.lessonContentGrant.upsert({
      where: { lessonId_userId: { lessonId: id, userId } },
      create: {
        lessonId: id,
        userId,
        grantedById: actor.realUserId,
      },
      update: {},
    });
    if (!existing) {
      try {
        await this.notifications.notifyLessonOpened({
          userIds: [userId],
          courseId: lesson.module.courseId,
          lessonId: id,
          lessonTitle: lesson.title,
        });
      } catch {
        /* non-blocking */
      }
    }
    return grant;
  }

  private async notifyLessonOpenedToEnrolled(
    courseId: string,
    lessonId: string,
    lessonTitle: string,
  ) {
    try {
      const enrollments = await this.prisma.enrollment.findMany({
        where: { courseId, status: EnrollmentStatus.ACTIVE },
        select: { userId: true },
      });
      await this.notifications.notifyLessonOpened({
        userIds: enrollments.map((e) => e.userId),
        courseId,
        lessonId,
        lessonTitle,
      });
    } catch {
      /* non-blocking */
    }
  }

  async revokeContentGrant(actor: AuthUser, id: string, userId: string) {
    const lesson = await this.getLessonWithCourse(id);
    await this.requireManage(actor, lesson.module.courseId);
    await this.prisma.lessonContentGrant.deleteMany({
      where: { lessonId: id, userId },
    });
    return { ok: true };
  }

  async listContentGrants(actor: AuthUser, id: string) {
    const lesson = await this.getLessonWithCourse(id);
    await this.requireManage(actor, lesson.module.courseId);
    return this.prisma.lessonContentGrant.findMany({
      where: { lessonId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        grantedById: true,
        createdAt: true,
      },
    });
  }

  async setExternalVideo(actor: AuthUser, id: string, dto: ExternalVideoDto) {
    const lesson = await this.getLessonWithCourse(id);
    await this.requireManage(actor, lesson.module.courseId);
    try {
      classifyExternalVideoUrl(dto.url);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    return this.prisma.lesson.update({
      where: { id },
      data: {
        videoSource: VideoSource.EXTERNAL_URL,
        videoUrl: dto.url,
        storageKey: null,
        durationSec: dto.durationSec,
        type: this.typeAfterAddingVideo(lesson.type, lesson.content),
      },
    });
  }

  async setUploadedVideo(
    actor: AuthUser,
    id: string,
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('file is required');
    const lesson = await this.getLessonWithCourse(id);
    await this.requireManage(actor, lesson.module.courseId);
    const key = this.storage.buildLessonKey(
      lesson.module.courseId,
      id,
      file.originalname,
    );
    await this.storage.uploadObject(
      key,
      file.buffer,
      file.mimetype || 'application/octet-stream',
    );
    return this.prisma.lesson.update({
      where: { id },
      data: {
        videoSource: VideoSource.UPLOADED,
        storageKey: key,
        videoUrl: null,
        type: this.typeAfterAddingVideo(lesson.type, lesson.content),
      },
    });
  }

  /** Keep TEXT+video as MIXED; plain TEXT becomes VIDEO */
  private typeAfterAddingVideo(
    current: LessonType,
    content?: string | null,
  ): LessonType {
    if (current === LessonType.MIXED || current === LessonType.VIDEO) {
      return current;
    }
    if (content?.trim()) return LessonType.MIXED;
    return LessonType.VIDEO;
  }

  async playback(actor: AuthUser, id: string) {
    await this.contentAccess.assertContentOpen(actor, id);
    const lesson = await this.getLessonWithCourse(id);
    if (!lesson.videoSource) {
      throw new NotFoundException('Lesson has no video');
    }
    if (lesson.videoSource === VideoSource.UPLOADED) {
      if (!lesson.storageKey) {
        throw new NotFoundException('Uploaded video missing');
      }
      const url = await this.storage.getSignedGetUrl(lesson.storageKey);
      return { source: lesson.videoSource, kind: 'direct' as const, url };
    }
    if (!lesson.videoUrl) {
      throw new NotFoundException('External video missing');
    }
    const classified = classifyExternalVideoUrl(lesson.videoUrl);
    return {
      source: lesson.videoSource,
      kind: classified.kind,
      url: classified.url,
    };
  }

  private async syncCalendarEvent(
    lesson: {
      id: string;
      title: string;
      scheduledAt: Date | null;
      meetingUrl: string | null;
    },
    courseId: string,
    actorId: string,
  ) {
    const existing = await this.prisma.courseEvent.findFirst({
      where: { lessonId: lesson.id, type: CourseEventType.LIVE },
      orderBy: { createdAt: 'asc' },
    });

    if (!lesson.scheduledAt) {
      if (existing) {
        await this.prisma.courseEvent.delete({ where: { id: existing.id } });
      }
      return;
    }

    const endsAt = new Date(lesson.scheduledAt.getTime() + 60 * 60 * 1000);
    if (existing) {
      await this.prisma.courseEvent.update({
        where: { id: existing.id },
        data: {
          title: lesson.title,
          startsAt: lesson.scheduledAt,
          endsAt,
          meetingUrl: lesson.meetingUrl,
          type: CourseEventType.LIVE,
        },
      });
      return;
    }

    await this.prisma.courseEvent.create({
      data: {
        courseId,
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

  private async getLessonWithCourse(id: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: { module: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return lesson;
  }

  private async requireManage(actor: AuthUser, courseId: string) {
    if (!(await this.access.canManageCourse(actor, courseId))) {
      throw new ForbiddenException('Cannot manage this course');
    }
  }
}
