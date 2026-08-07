import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  StoredFileOwnerType,
  SubmissionStatus,
} from '@prisma/client';
import { CourseAccessService } from '../enrollments/course-access.service';
import { LessonContentAccessService } from '../lessons/lesson-content-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';
import { StorageService } from '../storage/storage.service';
import {
  assertCourseMaterial,
  assertEventMaterial,
  assertPngOrPdf,
  assertSupportAttachment,
  decodeUploadFilename,
  IMAGE_MIMES,
  MAX_PNG_PDF_BYTES,
} from './files.mime';

function assertReviewPhoto(mime: string, size: number): void {
  if (!IMAGE_MIMES.has(mime)) {
    throw new Error('Allowed: PNG, JPEG, WebP');
  }
  if (size > MAX_PNG_PDF_BYTES) {
    throw new Error('File exceeds 20 MB limit');
  }
}

type OwnerContext = {
  courseId: string | null;
  ownerType: StoredFileOwnerType;
  ownerId: string;
  submissionUserId?: string;
  submissionStatus?: SubmissionStatus;
  reviewStatus?: string;
  supportThreadOpen?: boolean;
  supportParticipantIds?: string[];
};

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly storage: StorageService,
    private readonly lessonContent: LessonContentAccessService,
  ) {}

  async upload(
    actor: AuthUser,
    ownerType: StoredFileOwnerType,
    ownerId: string,
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('file is required');
    try {
      if (ownerType === StoredFileOwnerType.COURSE_EVENT_MATERIAL) {
        assertEventMaterial(file.mimetype || '', file.size);
      } else if (ownerType === StoredFileOwnerType.COURSE_MATERIAL) {
        assertCourseMaterial(file.mimetype || '', file.size);
      } else if (ownerType === StoredFileOwnerType.COURSE_REVIEW) {
        assertReviewPhoto(file.mimetype || '', file.size);
      } else if (ownerType === StoredFileOwnerType.SUPPORT_MESSAGE) {
        assertSupportAttachment(file.mimetype || '', file.size);
      } else {
        assertPngOrPdf(file.mimetype || '', file.size);
      }
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const ctx = await this.resolveOwner(ownerType, ownerId);
    await this.assertCanUpload(actor, ctx);

    const originalName = decodeUploadFilename(file.originalname || 'file');

    const key = this.storage.buildFileKey(
      ctx.courseId ?? 'platform',
      ownerType,
      ownerId,
      originalName,
    );
    await this.storage.uploadObject(
      key,
      file.buffer,
      file.mimetype || 'application/octet-stream',
    );

    let reviewPublished = ownerType !== StoredFileOwnerType.COURSE_REVIEW;
    if (ownerType === StoredFileOwnerType.COURSE_REVIEW) {
      const review = await this.prisma.courseReview.findUnique({
        where: { id: ownerId },
        select: { publishedRating: true },
      });
      reviewPublished = review?.publishedRating != null;
    }

    return this.prisma.storedFile.create({
      data: {
        ownerType,
        ownerId,
        courseId: ctx.courseId,
        uploadedById: actor.id,
        originalName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey: key,
        isPublished: reviewPublished,
        pendingDelete: false,
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        ownerType: true,
        ownerId: true,
        courseId: true,
        isPublished: true,
      },
    });
  }

  async list(
    actor: AuthUser,
    ownerType: StoredFileOwnerType,
    ownerId: string,
  ) {
    const ctx = await this.resolveOwner(ownerType, ownerId);
    await this.assertCanRead(actor, ctx);
    return this.prisma.storedFile.findMany({
      where: { ownerType, ownerId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
  }

  async download(actor: AuthUser, id: string) {
    const row = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('File not found');
    const ctx = await this.resolveOwner(row.ownerType, row.ownerId);
    await this.assertCanRead(actor, ctx);
    const url = await this.storage.getSignedGetUrl(row.storageKey);
    return {
      url,
      originalName: row.originalName,
      mimeType: row.mimeType,
    };
  }

  async remove(actor: AuthUser, id: string) {
    const row = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('File not found');
    const ctx = await this.resolveOwner(row.ownerType, row.ownerId);
    await this.assertCanDelete(actor, ctx, row.uploadedById);

    await this.storage.deleteObject(row.storageKey);
    await this.prisma.storedFile.delete({ where: { id } });
    return { ok: true };
  }

  private async resolveOwner(
    ownerType: StoredFileOwnerType,
    ownerId: string,
  ): Promise<OwnerContext> {
    if (ownerType === StoredFileOwnerType.LESSON_MATERIAL) {
      const lesson = await this.prisma.lesson.findUnique({
        where: { id: ownerId },
        include: { module: true },
      });
      if (!lesson) throw new NotFoundException('Lesson not found');
      return {
        courseId: lesson.module.courseId,
        ownerType,
        ownerId,
      };
    }

    if (ownerType === StoredFileOwnerType.ASSIGNMENT_MATERIAL) {
      const assignment = await this.prisma.assignment.findUnique({
        where: { id: ownerId },
      });
      if (!assignment) throw new NotFoundException('Assignment not found');
      return {
        courseId: assignment.courseId,
        ownerType,
        ownerId,
      };
    }

    if (ownerType === StoredFileOwnerType.SUBMISSION_ATTACHMENT) {
      const submission = await this.prisma.submission.findUnique({
        where: { id: ownerId },
        include: { assignment: true },
      });
      if (!submission) throw new NotFoundException('Submission not found');
      return {
        courseId: submission.assignment.courseId,
        ownerType,
        ownerId,
        submissionUserId: submission.userId,
        submissionStatus: submission.status,
      };
    }

    if (ownerType === StoredFileOwnerType.COURSE_EVENT_MATERIAL) {
      const event = await this.prisma.courseEvent.findUnique({
        where: { id: ownerId },
      });
      if (!event) throw new NotFoundException('Event not found');
      return {
        courseId: event.courseId,
        ownerType,
        ownerId,
      };
    }

    if (ownerType === StoredFileOwnerType.COURSE_MATERIAL) {
      const course = await this.prisma.course.findUnique({
        where: { id: ownerId },
      });
      if (!course) throw new NotFoundException('Course not found');
      return {
        courseId: course.id,
        ownerType,
        ownerId,
      };
    }

    if (ownerType === StoredFileOwnerType.COURSE_REVIEW) {
      const review = await this.prisma.courseReview.findUnique({
        where: { id: ownerId },
      });
      if (!review) throw new NotFoundException('Review not found');
      const editable =
        review.status === 'PENDING' ||
        review.status === 'REJECTED' ||
        review.status === 'APPROVED';
      return {
        courseId: review.courseId,
        ownerType,
        ownerId,
        submissionUserId: review.userId,
        submissionStatus: editable
          ? SubmissionStatus.IN_PROGRESS
          : SubmissionStatus.GRADED,
        reviewStatus: review.status,
      };
    }

    if (ownerType === StoredFileOwnerType.SUPPORT_MESSAGE) {
      const message = await this.prisma.supportMessage.findUnique({
        where: { id: ownerId },
        include: {
          thread: {
            include: {
              messages: { select: { senderId: true } },
            },
          },
        },
      });
      if (!message) throw new NotFoundException('Support message not found');
      const participantIds = [
        message.thread.createdById,
        ...message.thread.messages.map((m) => m.senderId),
      ];
      return {
        courseId: message.thread.courseId,
        ownerType,
        ownerId,
        supportThreadOpen: message.thread.status === 'OPEN',
        supportParticipantIds: [...new Set(participantIds)],
      };
    }

    throw new BadRequestException('Invalid ownerType');
  }

  private async assertCanUpload(actor: AuthUser, ctx: OwnerContext) {
    if (
      ctx.ownerType === StoredFileOwnerType.LESSON_MATERIAL ||
      ctx.ownerType === StoredFileOwnerType.ASSIGNMENT_MATERIAL ||
      ctx.ownerType === StoredFileOwnerType.COURSE_EVENT_MATERIAL ||
      ctx.ownerType === StoredFileOwnerType.COURSE_MATERIAL
    ) {
      if (
        !ctx.courseId ||
        !(await this.access.canManageCourse(actor, ctx.courseId))
      ) {
        throw new ForbiddenException('Cannot manage this course');
      }
      return;
    }

    if (ctx.ownerType === StoredFileOwnerType.SUPPORT_MESSAGE) {
      if (!ctx.supportThreadOpen) {
        throw new BadRequestException('Thread is closed');
      }
      if (ctx.supportParticipantIds?.includes(actor.id)) return;
      if (
        ctx.courseId &&
        (await this.access.canManageCourse(actor, ctx.courseId))
      ) {
        return;
      }
      if (actor.realGlobalRole === 'ADMIN') return;
      if (actor.realGlobalRole === 'SUPPORT') return;
      throw new ForbiddenException('Cannot attach to this thread');
    }

    if (ctx.ownerType === StoredFileOwnerType.COURSE_REVIEW) {
      if (ctx.submissionUserId !== actor.id) {
        throw new ForbiddenException('Not your review');
      }
      if (ctx.submissionStatus !== SubmissionStatus.IN_PROGRESS) {
        throw new BadRequestException('Review is not editable');
      }
      const activeCount = await this.prisma.storedFile.count({
        where: {
          ownerType: StoredFileOwnerType.COURSE_REVIEW,
          ownerId: ctx.ownerId,
          pendingDelete: false,
        },
      });
      if (activeCount >= 5) {
        throw new BadRequestException('Максимум 5 фото к отзыву');
      }
      return;
    }

    if (ctx.ownerType === StoredFileOwnerType.SUBMISSION_ATTACHMENT) {
      if (ctx.submissionUserId !== actor.id) {
        throw new ForbiddenException('Not your submission');
      }
      if (ctx.submissionStatus !== SubmissionStatus.IN_PROGRESS) {
        throw new BadRequestException('Submission is not editable');
      }
      return;
    }
  }

  private async assertCanRead(actor: AuthUser, ctx: OwnerContext) {
    if (ctx.ownerType === StoredFileOwnerType.COURSE_MATERIAL) {
      if (
        ctx.courseId &&
        (await this.access.canManageCourse(actor, ctx.courseId))
      ) {
        return;
      }
      if (!ctx.courseId) throw new ForbiddenException('No access');
      const course = await this.prisma.course.findUnique({
        where: { id: ctx.courseId },
        select: { isPublished: true },
      });
      if (course?.isPublished) return;
      if (await this.access.hasContentAccess(actor, ctx.courseId)) return;
      throw new ForbiddenException('No access');
    }

    if (ctx.ownerType === StoredFileOwnerType.SUPPORT_MESSAGE) {
      if (ctx.supportParticipantIds?.includes(actor.id)) return;
      if (
        ctx.courseId &&
        (await this.access.canManageCourse(actor, ctx.courseId))
      ) {
        return;
      }
      if (actor.realGlobalRole === 'ADMIN') return;
      if (actor.realGlobalRole === 'SUPPORT') return;
      throw new ForbiddenException('No access');
    }

    if (ctx.ownerType === StoredFileOwnerType.COURSE_REVIEW) {
      if (ctx.submissionUserId === actor.id) return;
      if (
        ctx.courseId &&
        (await this.access.canManageCourse(actor, ctx.courseId))
      ) {
        return;
      }
      const review = await this.prisma.courseReview.findUnique({
        where: { id: ctx.ownerId },
        select: { publishedRating: true },
      });
      if (review?.publishedRating != null) return;
      throw new ForbiddenException('No access');
    }

    if (
      ctx.ownerType === StoredFileOwnerType.LESSON_MATERIAL ||
      ctx.ownerType === StoredFileOwnerType.ASSIGNMENT_MATERIAL ||
      ctx.ownerType === StoredFileOwnerType.COURSE_EVENT_MATERIAL
    ) {
      if (
        !ctx.courseId ||
        !(await this.access.hasContentAccess(actor, ctx.courseId))
      ) {
        throw new ForbiddenException('No access');
      }
      if (ctx.ownerType === StoredFileOwnerType.LESSON_MATERIAL) {
        await this.lessonContent.assertContentOpen(actor, ctx.ownerId);
      }
      if (ctx.ownerType === StoredFileOwnerType.COURSE_EVENT_MATERIAL) {
        const event = await this.prisma.courseEvent.findUnique({
          where: { id: ctx.ownerId },
          select: { lessonId: true },
        });
        if (event?.lessonId) {
          await this.lessonContent.assertContentOpen(actor, event.lessonId);
        }
      }
      return;
    }

    if (ctx.ownerType === StoredFileOwnerType.SUBMISSION_ATTACHMENT) {
      if (ctx.submissionUserId === actor.id) return;
      if (
        ctx.courseId &&
        (await this.access.canManageCourse(actor, ctx.courseId))
      ) {
        return;
      }
      throw new ForbiddenException('No access');
    }
  }

  private async assertCanDelete(
    actor: AuthUser,
    ctx: OwnerContext,
    uploadedById: string,
  ) {
    if (
      ctx.ownerType === StoredFileOwnerType.LESSON_MATERIAL ||
      ctx.ownerType === StoredFileOwnerType.ASSIGNMENT_MATERIAL ||
      ctx.ownerType === StoredFileOwnerType.COURSE_EVENT_MATERIAL ||
      ctx.ownerType === StoredFileOwnerType.COURSE_MATERIAL
    ) {
      if (
        !ctx.courseId ||
        !(await this.access.canManageCourse(actor, ctx.courseId))
      ) {
        throw new ForbiddenException('Cannot manage this course');
      }
      return;
    }

    if (ctx.ownerType === StoredFileOwnerType.SUPPORT_MESSAGE) {
      if (uploadedById === actor.id && ctx.supportThreadOpen) return;
      if (
        ctx.courseId &&
        (await this.access.canManageCourse(actor, ctx.courseId))
      ) {
        return;
      }
      if (actor.realGlobalRole === 'ADMIN') return;
      if (actor.realGlobalRole === 'SUPPORT') return;
      throw new ForbiddenException('Cannot delete this file');
    }

    if (ctx.ownerType === StoredFileOwnerType.COURSE_REVIEW) {
      if (
        ctx.submissionUserId === actor.id &&
        ctx.submissionStatus === SubmissionStatus.IN_PROGRESS
      ) {
        return;
      }
      if (
        ctx.courseId &&
        (await this.access.canManageCourse(actor, ctx.courseId))
      ) {
        return;
      }
      throw new ForbiddenException('Cannot delete this file');
    }

    if (ctx.ownerType === StoredFileOwnerType.SUBMISSION_ATTACHMENT) {
      if (
        ctx.courseId &&
        (await this.access.canManageCourse(actor, ctx.courseId))
      ) {
        return;
      }
      if (
        ctx.submissionUserId === actor.id &&
        ctx.submissionStatus === SubmissionStatus.IN_PROGRESS &&
        uploadedById === actor.id
      ) {
        return;
      }
      throw new ForbiddenException('Cannot delete this file');
    }
  }
}
