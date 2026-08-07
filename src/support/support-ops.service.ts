import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GlobalRole,
  LessonCompletionSource,
  XpReason,
} from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { CourseAccessService } from '../enrollments/course-access.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';
import { AdjustXpDto, RadarBonusDto } from './dto/support-ops.dto';

const COMPLETE_PCT = 80;

@Injectable()
export class SupportOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly crypto: CryptoService,
    private readonly auth: AuthService,
    private readonly outbox: OutboxService,
  ) {}

  private assertOps(actor: AuthUser) {
    if (!this.access.isSupportOps(actor)) {
      throw new ForbiddenException('Support ops only');
    }
  }

  async searchUsers(actor: AuthUser, q: string) {
    this.assertOps(actor);
    const query = q.trim();
    if (query.length < 2) {
      throw new BadRequestException('Query too short');
    }

    if (query.includes('@')) {
      const emailHash = this.crypto.emailBlindIndex(query);
      const user = await this.prisma.user.findUnique({ where: { emailHash } });
      return user ? [await this.auth.toPublicUser(user)] : [];
    }

    const byId = await this.prisma.user.findUnique({ where: { id: query } });
    if (byId) return [await this.auth.toPublicUser(byId)];

    const byNick = await this.prisma.user.findMany({
      where: {
        nickname: { contains: query, mode: 'insensitive' },
        globalRole: GlobalRole.STUDENT,
      },
      take: 30,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(byNick.map((u) => this.auth.toPublicUser(u)));
  }

  async getStudentCard(actor: AuthUser, userId: string) {
    this.assertOps(actor);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const [enrollments, payments, threads, xpBalances] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          course: { select: { id: true, title: true, slug: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: {
          course: { select: { id: true, title: true } },
        },
      }),
      this.prisma.supportThread.findMany({
        where: { createdById: userId },
        orderBy: { lastMessageAt: 'desc' },
        take: 20,
        select: {
          id: true,
          channel: true,
          topic: true,
          subject: true,
          status: true,
          lastMessageAt: true,
          courseId: true,
        },
      }),
      this.prisma.xpBalance.findMany({
        where: { userId },
        include: { course: { select: { id: true, title: true } } },
      }),
    ]);

    return {
      user: await this.auth.toPublicUser(user),
      enrollments: enrollments.map((e) => ({
        courseId: e.courseId,
        course: e.course,
        status: e.status,
        createdAt: e.createdAt,
        cancelledAt: e.cancelledAt,
        refundStatus: e.refundStatus,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        courseId: p.courseId,
        course: p.course,
        amountCents: p.amountCents,
        currency: p.currency,
        status: p.status,
        createdAt: p.createdAt,
      })),
      threads,
      xp: xpBalances.map((x) => ({
        courseId: x.courseId,
        course: x.course,
        totalXp: x.totalXp,
      })),
    };
  }

  async adjustXp(
    actor: AuthUser,
    userId: string,
    courseId: string,
    dto: AdjustXpDto,
  ) {
    this.assertOps(actor);
    if (dto.delta === 0) throw new BadRequestException('delta cannot be 0');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { courseId_userId: { courseId, userId } },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.xpLedger.create({
        data: {
          userId,
          courseId,
          deltaXp: dto.delta,
          reason: XpReason.SUPPORT_ADJUST,
          note: dto.reason?.trim() || null,
          createdById: actor.realUserId,
        },
      });
      await tx.xpBalance.upsert({
        where: { userId_courseId: { userId, courseId } },
        create: {
          userId,
          courseId,
          totalXp: Math.max(0, dto.delta),
        },
        update: { totalXp: { increment: dto.delta } },
      });
      const bal = await tx.xpBalance.findUnique({
        where: { userId_courseId: { userId, courseId } },
      });
      if (bal && bal.totalXp < 0) {
        await tx.xpBalance.update({
          where: { id: bal.id },
          data: { totalXp: 0 },
        });
      }
    });

    const balance = await this.prisma.xpBalance.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    return { courseId, totalXp: balance?.totalXp ?? 0 };
  }

  async grantLesson(actor: AuthUser, userId: string, lessonId: string) {
    this.assertOps(actor);
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

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

    await this.prisma.lessonContentGrant.upsert({
      where: {
        lessonId_userId: { lessonId, userId },
      },
      create: {
        lessonId,
        userId,
        grantedById: actor.realUserId,
      },
      update: {},
    });
    return { ok: true, lessonId, userId };
  }

  async setLessonComplete(
    actor: AuthUser,
    userId: string,
    lessonId: string,
    completed = true,
  ) {
    this.assertOps(actor);
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const courseId = lesson.module.courseId;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.lessonEngagement.findUnique({
        where: { userId_lessonId: { userId, lessonId } },
      });
      if (completed) {
        const data = {
          courseId,
          viewedAt: existing?.viewedAt ?? now,
          completedAt: existing?.completedAt ?? now,
          completedBy: LessonCompletionSource.CURATOR,
          completedByUserId: actor.realUserId,
          maxProgressPct: Math.max(
            existing?.maxProgressPct ?? 0,
            COMPLETE_PCT,
          ),
        };
        if (existing) {
          await tx.lessonEngagement.update({
            where: { id: existing.id },
            data,
          });
        } else {
          await tx.lessonEngagement.create({
            data: { userId, lessonId, ...data },
          });
        }
        await this.outbox.enqueue(tx, 'LESSON_ENGAGEMENT', {
          userId,
          lessonId,
          courseId,
          progressPct: data.maxProgressPct,
          viewed: true,
          completed: true,
          skipped: !!existing?.skippedAt,
          source: 'SUPPORT',
        });
      } else if (existing?.completedAt) {
        await tx.lessonEngagement.update({
          where: { id: existing.id },
          data: {
            completedAt: null,
            completedBy: null,
            completedByUserId: actor.realUserId,
          },
        });
      }
    });

    return { ok: true, completed };
  }

  async setAttendance(
    actor: AuthUser,
    userId: string,
    lessonId: string,
    completed: boolean,
  ) {
    this.assertOps(actor);
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const courseId = lesson.module.courseId;

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { courseId_userId: { courseId, userId } },
    });
    if (!enrollment || enrollment.status !== 'ACTIVE') {
      throw new BadRequestException('User is not an active enrollee');
    }

    return this.setLessonComplete(actor, userId, lessonId, completed);
  }

  async addRadarBonus(
    actor: AuthUser,
    userId: string,
    courseId: string,
    dto: RadarBonusDto,
  ) {
    this.assertOps(actor);
    if (dto.delta === 0) throw new BadRequestException('delta cannot be 0');

    const mod = await this.prisma.courseModule.findFirst({
      where: { id: dto.moduleId, courseId },
    });
    if (!mod) throw new NotFoundException('Module not found');

    const row = await this.prisma.radarBonus.create({
      data: {
        userId,
        courseId,
        moduleId: dto.moduleId,
        pointsDelta: dto.delta,
        reason: dto.reason?.trim() || null,
        createdById: actor.realUserId,
      },
    });
    return row;
  }

  async listCourseModules(actor: AuthUser, courseId: string) {
    this.assertOps(actor);
    return this.prisma.courseModule.findMany({
      where: { courseId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        title: true,
        radarLabel: true,
        sortOrder: true,
        lessons: {
          select: { id: true, title: true, type: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async triggerPasswordReset(actor: AuthUser, userId: string, ip?: string) {
    this.assertOps(actor);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.globalRole === GlobalRole.ADMIN) {
      throw new ForbiddenException('Cannot reset admin password this way');
    }
    const email = this.crypto.decrypt(user.emailEnc);
    return this.auth.forgotPassword(email, ip, 'support-ops');
  }

  async listStaffRatings(actor: AuthUser) {
    if (actor.realGlobalRole !== GlobalRole.ADMIN) {
      throw new ForbiddenException();
    }

    const ratings = await this.prisma.supportRating.groupBy({
      by: ['agentId'],
      _avg: { score: true },
      _count: { score: true },
    });

    const agentIds = ratings.map((r) => r.agentId);
    const agents = agentIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: agentIds } },
        })
      : [];
    const byId = new Map(agents.map((a) => [a.id, a]));

    const curatorIds = new Set(
      (
        await this.prisma.courseMembership.findMany({
          where: {
            userId: { in: agentIds },
            role: 'CURATOR',
          },
          select: { userId: true },
        })
      ).map((m) => m.userId),
    );

    const rows = await Promise.all(
      ratings.map(async (r) => {
        const u = byId.get(r.agentId);
        const pub = u
          ? await this.auth.toPublicUser(u)
          : { id: r.agentId, email: null, globalRole: 'STUDENT' as const };
        let roleLabel = 'Сотрудник';
        if (pub.globalRole === 'ADMIN') roleLabel = 'Админ';
        else if (pub.globalRole === 'SUPPORT') roleLabel = 'Поддержка';
        else if (curatorIds.has(r.agentId)) roleLabel = 'Куратор';
        return {
          userId: r.agentId,
          email: pub.email,
          firstName: 'firstName' in pub ? pub.firstName : null,
          nickname: 'nickname' in pub ? pub.nickname : null,
          globalRole: pub.globalRole,
          roleLabel,
          avgScore: r._avg.score ? Math.round(r._avg.score * 10) / 10 : 0,
          ratingCount: r._count.score,
        };
      }),
    );

    return rows.sort((a, b) => b.ratingCount - a.ratingCount);
  }

  async listAgentRatings(actor: AuthUser, agentId: string) {
    if (actor.realGlobalRole !== GlobalRole.ADMIN) {
      throw new ForbiddenException();
    }
    const rows = await this.prisma.supportRating.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      include: {
        thread: {
          select: {
            id: true,
            subject: true,
            channel: true,
            topic: true,
            createdAt: true,
          },
        },
        rater: true,
      },
    });

    return Promise.all(
      rows.map(async (r) => {
        let raterName: string | null = null;
        try {
          raterName = r.rater.nickname
            ? r.rater.nickname
            : r.rater.firstNameEnc
              ? this.crypto.decrypt(r.rater.firstNameEnc)
              : this.crypto.decrypt(r.rater.emailEnc);
        } catch {
          raterName = null;
        }
        return {
          id: r.id,
          score: r.score,
          comment: r.comment,
          createdAt: r.createdAt,
          thread: r.thread,
          raterName,
        };
      }),
    );
  }
}
