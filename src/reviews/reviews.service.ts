import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  EnrollmentStatus,
  GlobalRole,
  MembershipRole,
  NotificationChannel,
  NotificationKind,
  ReviewStatus,
  StoredFileOwnerType,
} from '@prisma/client';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CryptoService } from '../common/crypto/crypto.service';
import { CourseAccessService } from '../enrollments/course-access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';
import { StorageService } from '../storage/storage.service';

export class CreateReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;
}

export class UpdateReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;
}

export class ModerateReviewDto {
  @IsString()
  @MinLength(1)
  status!: 'APPROVED' | 'REJECTED';
}

const MIN_ENROLL_DAYS = 3;
const REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_REVIEW_PHOTOS = 5;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly crypto: CryptoService,
  ) {}

  private enrollCutoff() {
    return new Date(Date.now() - MIN_ENROLL_DAYS * 24 * 60 * 60 * 1000);
  }

  async eligibility(user: AuthUser, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { courseId_userId: { courseId, userId: user.id } },
    });
    const existing = await this.prisma.courseReview.findUnique({
      where: { courseId_userId: { courseId, userId: user.id } },
    });
    const enrolled = enrollment?.status === EnrollmentStatus.ACTIVE;
    const canWrite =
      enrolled &&
      (!existing || existing.status === ReviewStatus.REJECTED);
    const canEdit = enrolled && !!existing;
    const canDelete = enrolled && !!existing;

    let myReview: Awaited<ReturnType<ReviewsService['presentMine']>> | null =
      null;
    if (existing) {
      myReview = await this.presentMine(existing);
    }

    return {
      canWrite,
      canEdit,
      canDelete,
      enrolled,
      daysRequired: MIN_ENROLL_DAYS,
      enrolledAt: enrollment?.createdAt ?? null,
      myReview,
    };
  }

  async listApproved(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, isPublished: true },
    });
    if (!course) throw new NotFoundException('Course not found');

    const rows = await this.prisma.courseReview.findMany({
      where: { courseId, publishedRating: { not: null } },
      orderBy: { updatedAt: 'desc' },
      include: {
        user: {
          select: { id: true, nickname: true, firstNameEnc: true },
        },
      },
    });

    return Promise.all(rows.map((r) => this.presentPublished(r)));
  }

  async create(user: AuthUser, courseId: string, dto: CreateReviewDto) {
    const elig = await this.eligibility(user, courseId);
    if (!elig.canWrite) {
      throw new ForbiddenException(
        elig.enrolled
          ? 'Отзыв уже отправлен или на проверке'
          : 'Нужна активная запись на курс',
      );
    }

    const existing = await this.prisma.courseReview.findUnique({
      where: { courseId_userId: { courseId, userId: user.id } },
    });

    const data = {
      rating: dto.rating,
      body: dto.body?.trim() || null,
      status: ReviewStatus.PENDING,
      moderatedAt: null,
      moderatedById: null,
    };

    const review = existing
      ? await this.prisma.courseReview.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.courseReview.create({
          data: {
            courseId,
            userId: user.id,
            ...data,
          },
        });

    try {
      await this.notifyStaffPending(courseId, review.id);
    } catch {
      /* non-blocking */
    }

    return this.presentMine(review);
  }

  async update(user: AuthUser, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.prisma.courseReview.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException();
    if (review.userId !== user.id) throw new ForbiddenException();

    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        courseId_userId: { courseId: review.courseId, userId: user.id },
      },
    });
    if (enrollment?.status !== EnrollmentStatus.ACTIVE) {
      throw new ForbiddenException('Нужна активная запись на курс');
    }

    const body = dto.body?.trim() || null;
    const alreadyPublished = review.publishedRating != null;

    // Already in catalog: apply edit immediately (no stale duplicate).
    // First-time / unpublished: stay PENDING until staff approves.
    const updated = await this.prisma.courseReview.update({
      where: { id: reviewId },
      data: alreadyPublished
        ? {
            rating: dto.rating,
            body,
            publishedRating: dto.rating,
            publishedBody: body,
            status: ReviewStatus.APPROVED,
            moderatedAt: new Date(),
            moderatedById: null,
          }
        : {
            rating: dto.rating,
            body,
            status: ReviewStatus.PENDING,
            moderatedAt: null,
            moderatedById: null,
          },
    });

    if (alreadyPublished) {
      await this.publishAllPhotos(reviewId);
    } else {
      try {
        await this.notifyStaffPending(review.courseId, review.id);
      } catch {
        /* non-blocking */
      }
    }

    return this.presentMine(updated);
  }

  async remove(user: AuthUser, reviewId: string) {
    const review = await this.prisma.courseReview.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException();
    if (review.userId !== user.id) throw new ForbiddenException();

    const files = await this.prisma.storedFile.findMany({
      where: {
        ownerType: StoredFileOwnerType.COURSE_REVIEW,
        ownerId: reviewId,
      },
      select: { id: true, storageKey: true },
    });
    for (const f of files) {
      try {
        await this.storage.deleteObject(f.storageKey);
      } catch {
        /* ignore storage errors */
      }
    }
    if (files.length) {
      await this.prisma.storedFile.deleteMany({
        where: { id: { in: files.map((f) => f.id) } },
      });
    }
    await this.prisma.courseReview.delete({ where: { id: reviewId } });
    return { ok: true };
  }

  async listPending(actor: AuthUser) {
    const where =
      actor.realGlobalRole === GlobalRole.ADMIN
        ? { status: ReviewStatus.PENDING }
        : {
            status: ReviewStatus.PENDING,
            course: {
              memberships: {
                some: {
                  userId: actor.id,
                  role: MembershipRole.CURATOR,
                },
              },
            },
          };

    const rows = await this.prisma.courseReview.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        course: { select: { id: true, title: true } },
        user: {
          select: { id: true, nickname: true, firstNameEnc: true },
        },
      },
    });
    return Promise.all(
      rows.map(async (r) => ({
        ...(await this.presentMine(r)),
        course: r.course,
        isEdit: r.publishedRating != null,
        published: r.publishedRating
          ? {
              rating: r.publishedRating,
              body: r.publishedBody,
            }
          : null,
      })),
    );
  }

  async pendingCount(actor: AuthUser) {
    if (actor.realGlobalRole === GlobalRole.ADMIN) {
      return this.prisma.courseReview.count({
        where: { status: ReviewStatus.PENDING },
      });
    }
    return this.prisma.courseReview.count({
      where: {
        status: ReviewStatus.PENDING,
        course: {
          memberships: {
            some: { userId: actor.id, role: MembershipRole.CURATOR },
          },
        },
      },
    });
  }

  async moderate(actor: AuthUser, reviewId: string, dto: ModerateReviewDto) {
    if (dto.status !== 'APPROVED' && dto.status !== 'REJECTED') {
      throw new BadRequestException('status must be APPROVED or REJECTED');
    }
    const review = await this.prisma.courseReview.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException();
    if (!(await this.access.canManageCourse(actor, review.courseId))) {
      throw new ForbiddenException();
    }

    if (dto.status === 'APPROVED') {
      await this.applyApprovePhotos(reviewId);
      return this.prisma.courseReview.update({
        where: { id: reviewId },
        data: {
          status: ReviewStatus.APPROVED,
          publishedRating: review.rating,
          publishedBody: review.body,
          moderatedAt: new Date(),
          moderatedById: actor.realUserId,
        },
      });
    }

    // REJECT
    if (review.publishedRating != null) {
      await this.revertDraftPhotos(reviewId);
      return this.prisma.courseReview.update({
        where: { id: reviewId },
        data: {
          status: ReviewStatus.APPROVED,
          rating: review.publishedRating,
          body: review.publishedBody,
          moderatedAt: new Date(),
          moderatedById: actor.realUserId,
        },
      });
    }

    return this.prisma.courseReview.update({
      where: { id: reviewId },
      data: {
        status: ReviewStatus.REJECTED,
        moderatedAt: new Date(),
        moderatedById: actor.realUserId,
      },
    });
  }

  /** Manual: remind enrolled students without a review */
  async requestReviews(actor: AuthUser, courseId: string) {
    if (!(await this.access.canManageCourse(actor, courseId))) {
      throw new ForbiddenException();
    }
    return this.sendReviewReminders(courseId, { force: true });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cronAutoReminders() {
    const cutoff = this.enrollCutoff();
    const weekAgo = new Date(Date.now() - REMINDER_COOLDOWN_MS);
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        status: EnrollmentStatus.ACTIVE,
        createdAt: { lte: cutoff },
        OR: [
          { lastReviewReminderAt: null },
          { lastReviewReminderAt: { lte: weekAgo } },
        ],
      },
      select: { courseId: true },
      distinct: ['courseId'],
    });
    for (const e of enrollments) {
      try {
        await this.sendReviewReminders(e.courseId, { force: false });
      } catch {
        /* continue */
      }
    }
  }

  private async sendReviewReminders(
    courseId: string,
    opts: { force: boolean },
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true },
    });
    if (!course) throw new NotFoundException('Course not found');

    const cutoff = this.enrollCutoff();
    const weekAgo = new Date(Date.now() - REMINDER_COOLDOWN_MS);

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        courseId,
        status: EnrollmentStatus.ACTIVE,
        ...(opts.force
          ? {}
          : {
              createdAt: { lte: cutoff },
              OR: [
                { lastReviewReminderAt: null },
                { lastReviewReminderAt: { lte: weekAgo } },
              ],
            }),
      },
      select: { id: true, userId: true },
    });

    if (!enrollments.length) return { count: 0 };

    const existing = await this.prisma.courseReview.findMany({
      where: {
        courseId,
        userId: { in: enrollments.map((e) => e.userId) },
        OR: [
          { status: { in: [ReviewStatus.PENDING, ReviewStatus.APPROVED] } },
          { publishedRating: { not: null } },
        ],
      },
      select: { userId: true },
    });
    const hasReview = new Set(existing.map((r) => r.userId));
    const targets = enrollments.filter((e) => !hasReview.has(e.userId));
    if (!targets.length) return { count: 0 };

    const now = new Date();
    await this.prisma.enrollment.updateMany({
      where: { id: { in: targets.map((t) => t.id) } },
      data: { lastReviewReminderAt: now },
    });

    await this.notifications.createMany(
      targets.map((t) => t.userId),
      {
        kind: NotificationKind.REVIEW_REQUEST,
        channel: NotificationChannel.TOAST,
        title: 'Оставьте отзыв о курсе',
        body: `«${course.title}» — поделитесь впечатлением`,
        courseId,
        linkUrl: `/courses/${courseId}?review=1`,
        meta: { audience: 'student' },
      },
    );

    return { count: targets.length };
  }

  private async notifyStaffPending(courseId: string, reviewId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { title: true },
    });
    const [admins, curators] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          globalRole: GlobalRole.ADMIN,
          isActive: true,
          notifyCourseReviews: true,
        },
        select: { id: true },
      }),
      this.prisma.courseMembership.findMany({
        where: { courseId, role: MembershipRole.CURATOR },
        select: { userId: true },
      }),
    ]);

    const adminIds = new Set(admins.map((a) => a.id));
    for (const a of adminIds) {
      await this.notifications.createForUser({
        userId: a,
        kind: NotificationKind.REVIEW_PENDING,
        channel: NotificationChannel.TOAST,
        title: 'Новый отзыв на модерацию',
        body: course?.title ?? 'Курс',
        courseId,
        linkUrl: `/admin/reviews`,
        meta: { reviewId, audience: 'staff' },
      });
    }
    for (const c of curators) {
      if (adminIds.has(c.userId)) continue;
      await this.notifications.createForUser({
        userId: c.userId,
        kind: NotificationKind.REVIEW_PENDING,
        channel: NotificationChannel.TOAST,
        title: 'Новый отзыв на модерацию',
        body: course?.title ?? 'Курс',
        courseId,
        linkUrl: `/curator/reviews`,
        meta: { reviewId, audience: 'staff' },
      });
    }
  }

  private async publishAllPhotos(reviewId: string) {
    const files = await this.prisma.storedFile.findMany({
      where: {
        ownerType: StoredFileOwnerType.COURSE_REVIEW,
        ownerId: reviewId,
      },
    });
    const toDelete = files.filter((f) => f.pendingDelete);
    for (const f of toDelete) {
      try {
        await this.storage.deleteObject(f.storageKey);
      } catch {
        /* ignore */
      }
    }
    if (toDelete.length) {
      await this.prisma.storedFile.deleteMany({
        where: { id: { in: toDelete.map((f) => f.id) } },
      });
    }
    await this.prisma.storedFile.updateMany({
      where: {
        ownerType: StoredFileOwnerType.COURSE_REVIEW,
        ownerId: reviewId,
      },
      data: { isPublished: true, pendingDelete: false },
    });
  }

  private async applyApprovePhotos(reviewId: string) {
    await this.publishAllPhotos(reviewId);
  }

  private async revertDraftPhotos(reviewId: string) {
    const files = await this.prisma.storedFile.findMany({
      where: {
        ownerType: StoredFileOwnerType.COURSE_REVIEW,
        ownerId: reviewId,
      },
    });
    const drafts = files.filter((f) => !f.isPublished && !f.pendingDelete);
    for (const f of drafts) {
      try {
        await this.storage.deleteObject(f.storageKey);
      } catch {
        /* ignore */
      }
    }
    if (drafts.length) {
      await this.prisma.storedFile.deleteMany({
        where: { id: { in: drafts.map((f) => f.id) } },
      });
    }
    await this.prisma.storedFile.updateMany({
      where: {
        ownerType: StoredFileOwnerType.COURSE_REVIEW,
        ownerId: reviewId,
        pendingDelete: true,
      },
      data: { pendingDelete: false },
    });
  }

  private async presentPublished(r: {
    id: string;
    rating: number;
    body: string | null;
    publishedRating: number | null;
    publishedBody: string | null;
    status: ReviewStatus;
    createdAt: Date;
    userId: string;
    user: {
      id: string;
      nickname: string | null;
      firstNameEnc: string | null;
    };
  }) {
    const base = await this.presentAuthor(r);
    const photos = await this.loadPhotos(r.id, 'published');
    return {
      id: r.id,
      rating: r.publishedRating ?? r.rating,
      body: r.publishedBody ?? r.body,
      status: r.status,
      createdAt: r.createdAt,
      authorName: base.authorName,
      userId: r.userId,
      photos,
    };
  }

  private async presentMine(r: {
    id: string;
    rating: number;
    body: string | null;
    publishedRating?: number | null;
    publishedBody?: string | null;
    status: ReviewStatus;
    createdAt: Date;
    userId: string;
    user?: {
      id: string;
      nickname: string | null;
      firstNameEnc: string | null;
    };
  }) {
    let authorName = 'Ученик';
    if (r.user) {
      authorName = (await this.presentAuthor(r as typeof r & { user: NonNullable<typeof r.user> })).authorName;
    }
    const photos = await this.loadPhotos(r.id, 'draft');
    return {
      id: r.id,
      rating: r.rating,
      body: r.body,
      publishedRating: r.publishedRating ?? null,
      publishedBody: r.publishedBody ?? null,
      status: r.status,
      createdAt: r.createdAt,
      authorName,
      userId: r.userId,
      photos,
    };
  }

  private async presentAuthor(r: {
    user: {
      nickname: string | null;
      firstNameEnc: string | null;
    };
  }) {
    let authorName = 'Ученик';
    if (r.user.nickname?.trim()) authorName = r.user.nickname.trim();
    else if (r.user.firstNameEnc) {
      try {
        authorName = this.crypto.decrypt(r.user.firstNameEnc) || 'Ученик';
      } catch {
        authorName = 'Ученик';
      }
    }
    return { authorName };
  }

  private async loadPhotos(
    reviewId: string,
    mode: 'published' | 'draft',
  ) {
    const files = await this.prisma.storedFile.findMany({
      where: {
        ownerType: StoredFileOwnerType.COURSE_REVIEW,
        ownerId: reviewId,
        ...(mode === 'published'
          ? { isPublished: true, pendingDelete: false }
          : { pendingDelete: false }),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        storageKey: true,
        isPublished: true,
      },
    });

    return Promise.all(
      files.map(async (f) => {
        let url = '';
        try {
          url = await this.storage.getSignedGetUrl(f.storageKey);
        } catch {
          url = '';
        }
        return {
          id: f.id,
          originalName: f.originalName,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          isPublished: f.isPublished,
          url,
        };
      }),
    );
  }
}
