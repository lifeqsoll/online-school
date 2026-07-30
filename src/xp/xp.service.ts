import { Injectable, ForbiddenException } from '@nestjs/common';
import { SubmissionStatus, XpReason } from '@prisma/client';
import { CryptoService } from '../common/crypto/crypto.service';
import { CourseAccessService } from '../enrollments/course-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';

@Injectable()
export class XpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly crypto: CryptoService,
  ) {}

  async syncBestAttempt(
    userId: string,
    courseId: string,
    assignmentId: string,
    submissionId: string,
  ): Promise<void> {
    const graded = await this.prisma.submission.findMany({
      where: {
        assignmentId,
        userId,
        status: { in: [SubmissionStatus.AUTO_GRADED, SubmissionStatus.GRADED] },
        scoreXp: { not: null },
      },
      select: { id: true, scoreXp: true },
    });

    let bestXp = 0;
    let bestSubmissionId: string | null = submissionId;
    for (const g of graded) {
      const xp = g.scoreXp ?? 0;
      if (xp >= bestXp) {
        bestXp = xp;
        bestSubmissionId = g.id;
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.assignmentBestXp.findUnique({
        where: { userId_assignmentId: { userId, assignmentId } },
      });
      const oldBest = existing?.bestXp ?? 0;
      const delta = bestXp - oldBest;

      await tx.assignmentBestXp.upsert({
        where: { userId_assignmentId: { userId, assignmentId } },
        create: {
          userId,
          assignmentId,
          bestXp,
          submissionId: bestSubmissionId,
        },
        update: { bestXp, submissionId: bestSubmissionId },
      });

      if (delta === 0) return;

      await tx.xpLedger.create({
        data: {
          userId,
          courseId,
          assignmentId,
          submissionId,
          deltaXp: delta,
          reason: XpReason.BEST_ATTEMPT,
        },
      });

      await tx.xpBalance.upsert({
        where: { userId_courseId: { userId, courseId } },
        create: { userId, courseId, totalXp: Math.max(0, delta) },
        update: { totalXp: { increment: delta } },
      });
    });
  }

  async getMyXp(user: AuthUser, courseId: string) {
    if (!(await this.access.hasContentAccess(user, courseId))) {
      throw new ForbiddenException();
    }
    const balance = await this.prisma.xpBalance.findUnique({
      where: { userId_courseId: { userId: user.id, courseId } },
    });
    return { courseId, totalXp: balance?.totalXp ?? 0 };
  }

  async leaderboard(user: AuthUser, courseId: string, limit = 20) {
    if (!(await this.access.hasContentAccess(user, courseId))) {
      throw new ForbiddenException();
    }
    const rows = await this.prisma.xpBalance.findMany({
      where: { courseId },
      orderBy: { totalXp: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: {
        user: {
          select: { id: true, firstNameEnc: true, lastNameEnc: true },
        },
      },
    });

    return rows.map((r, i) => {
      let displayName = 'User';
      try {
        const first = r.user.firstNameEnc
          ? this.crypto.decrypt(r.user.firstNameEnc)
          : '';
        const last = r.user.lastNameEnc
          ? this.crypto.decrypt(r.user.lastNameEnc)
          : '';
        displayName = `${first} ${last}`.trim() || 'User';
      } catch {
        displayName = 'User';
      }
      return {
        rank: i + 1,
        userId: r.userId,
        displayName,
        totalXp: r.totalXp,
      };
    });
  }
}
