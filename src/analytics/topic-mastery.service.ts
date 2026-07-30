import { Injectable } from '@nestjs/common';
import { SubmissionStatus } from '@prisma/client';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';

const STRUGGLE_THRESHOLD = 0.25;

@Injectable()
export class TopicMasteryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async recomputeForUserAssignment(userId: string, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        questions: true,
        topicLinks: true,
        submissions: {
          where: {
            userId,
            status: {
              in: [SubmissionStatus.AUTO_GRADED, SubmissionStatus.GRADED],
            },
          },
        },
      },
    });
    if (!assignment || !assignment.topicLinks.length) return;

    const best = assignment.submissions.reduce<{
      scorePoints: number;
      total: number;
    } | null>((acc, s) => {
      const scorePoints = s.scorePoints ?? 0;
      if (!acc || scorePoints > acc.scorePoints) {
        return {
          scorePoints,
          total: assignment.questions.reduce((t, q) => t + q.points, 0),
        };
      }
      return acc;
    }, null);

    const scorePct =
      best && best.total > 0 ? best.scorePoints / best.total : 0;
    const strugglingThis = scorePct < STRUGGLE_THRESHOLD;

    await this.outbox.enqueueStandalone('SUBMISSION_GRADED', {
      userId,
      assignmentId,
      courseId: assignment.courseId,
      scorePct,
      struggling: strugglingThis,
    });

    for (const link of assignment.topicLinks) {
      await this.recomputeTopic(userId, assignment.courseId, link.topicId);
    }
  }

  async recomputeTopic(userId: string, courseId: string, topicId: string) {
    const links = await this.prisma.assignmentTopic.findMany({
      where: { topicId },
      include: {
        assignment: {
          include: {
            questions: true,
            submissions: {
              where: {
                userId,
                status: {
                  in: [SubmissionStatus.AUTO_GRADED, SubmissionStatus.GRADED],
                },
              },
            },
          },
        },
      },
    });

    const pcts: number[] = [];
    let struggling = false;
    for (const link of links) {
      const a = link.assignment;
      const total = a.questions.reduce((t, q) => t + q.points, 0);
      if (!a.submissions.length || total <= 0) continue;
      const bestPoints = Math.max(
        ...a.submissions.map((s) => s.scorePoints ?? 0),
      );
      const pct = bestPoints / total;
      pcts.push(pct);
      if (pct < STRUGGLE_THRESHOLD) struggling = true;
    }

    const scorePct =
      pcts.length === 0
        ? 0
        : Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 100);

    if (pcts.length === 0) struggling = false;

    const topic = await this.prisma.topic.findUnique({ where: { id: topicId } });

    await this.prisma.$transaction(async (tx) => {
      await tx.topicMastery.upsert({
        where: { userId_topicId: { userId, topicId } },
        create: { userId, courseId, topicId, scorePct, struggling },
        update: { scorePct, struggling },
      });
      await this.outbox.enqueue(tx, 'MASTERY_UPSERT', {
        userId,
        courseId,
        topicId,
        topicName: topic?.name ?? '',
        scorePct,
        struggling,
      });
    });
  }
}

export function masteryFromScores(scorePcts: number[]): {
  scorePct: number;
  struggling: boolean;
} {
  if (!scorePcts.length) return { scorePct: 0, struggling: false };
  const struggling = scorePcts.some((p) => p < STRUGGLE_THRESHOLD);
  const scorePct = Math.round(
    (scorePcts.reduce((a, b) => a + b, 0) / scorePcts.length) * 100,
  );
  return { scorePct, struggling };
}
