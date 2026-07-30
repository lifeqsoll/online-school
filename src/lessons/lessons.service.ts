import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, VideoSource } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CourseAccessService } from '../enrollments/course-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';
import { StorageService } from '../storage/storage.service';
import {
  CreateLessonDto,
  ExternalVideoDto,
  UpdateLessonDto,
} from './dto/lesson.dto';
import { classifyExternalVideoUrl } from './video-url.util';

@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: AuthUser, moduleId: string, dto: CreateLessonDto) {
    const mod = await this.prisma.courseModule.findUnique({
      where: { id: moduleId },
    });
    if (!mod) throw new NotFoundException('Module not found');
    await this.requireManage(actor, mod.courseId);
    return this.prisma.lesson.create({
      data: {
        moduleId,
        title: dto.title,
        type: dto.type,
        content: dto.content,
        sortOrder: dto.sortOrder ?? 0,
        isPublished: dto.isPublished ?? false,
      },
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateLessonDto) {
    const lesson = await this.getLessonWithCourse(id);
    await this.requireManage(actor, lesson.module.courseId);
    const updated = await this.prisma.lesson.update({
      where: { id },
      data: {
        title: dto.title,
        type: dto.type,
        content: dto.content,
        sortOrder: dto.sortOrder,
        isPublished: dto.isPublished,
      },
    });
    await this.audit.append({
      action: AuditAction.LESSON_UPDATE,
      actorId: actor.realUserId,
      meta: { lessonId: id },
    });
    return updated;
  }

  async remove(actor: AuthUser, id: string) {
    const lesson = await this.getLessonWithCourse(id);
    await this.requireManage(actor, lesson.module.courseId);
    await this.prisma.lesson.delete({ where: { id } });
    await this.audit.append({
      action: AuditAction.LESSON_UPDATE,
      actorId: actor.realUserId,
      meta: { lessonId: id, deleted: true },
    });
    return { ok: true };
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
      },
    });
  }

  async playback(actor: AuthUser, id: string) {
    const lesson = await this.getLessonWithCourse(id);
    if (!(await this.access.hasContentAccess(actor, lesson.module.courseId))) {
      throw new ForbiddenException('No access to this lesson');
    }
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
