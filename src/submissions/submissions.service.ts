import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  AssignmentResponseMode,
  QuestionType,
  ShortMatch,
  StoredFileOwnerType,
  SubmissionStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CourseAccessService } from '../enrollments/course-access.service';
import {
  computeScoreXp,
  gradeChoice,
  gradeShort,
} from '../grading/auto-grade';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';
import { XpService } from '../xp/xp.service';
import { TopicMasteryService } from '../analytics/topic-mastery.service';
import {
  GradeSubmissionDto,
  SaveAnswersDto,
} from './dto/submission.dto';

@Injectable()
export class SubmissionsService {
  private readonly logger = new Logger(SubmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly xp: XpService,
    private readonly mastery: TopicMasteryService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async createAttempt(user: AuthUser, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment || !assignment.isPublished) {
      throw new NotFoundException('Assignment not found');
    }
    if (!(await this.access.hasContentAccess(user, assignment.courseId))) {
      throw new ForbiddenException();
    }

    const draft = await this.prisma.submission.findFirst({
      where: {
        assignmentId,
        userId: user.id,
        status: SubmissionStatus.IN_PROGRESS,
      },
      include: { answers: true },
      orderBy: { attemptNo: 'desc' },
    });
    if (draft) return draft;

    const count = await this.prisma.submission.count({
      where: { assignmentId, userId: user.id },
    });

    if (
      assignment.maxAttempts != null &&
      count >= assignment.maxAttempts
    ) {
      throw new BadRequestException('Max attempts reached');
    }

    const finished = await this.prisma.submission.findFirst({
      where: {
        assignmentId,
        userId: user.id,
        status: { not: SubmissionStatus.IN_PROGRESS },
      },
      orderBy: { attemptNo: 'desc' },
    });
    // Default: one completed attempt is enough — no silent retakes
    if (finished && (assignment.maxAttempts == null || assignment.maxAttempts <= 1)) {
      throw new BadRequestException('Max attempts reached');
    }

    try {
      return await this.prisma.submission.create({
        data: {
          assignmentId,
          userId: user.id,
          attemptNo: count + 1,
          status: SubmissionStatus.IN_PROGRESS,
        },
        include: { answers: true },
      });
    } catch {
      // Concurrent create (unique attemptNo) — reuse existing draft
      const again = await this.prisma.submission.findFirst({
        where: {
          assignmentId,
          userId: user.id,
          status: SubmissionStatus.IN_PROGRESS,
        },
        include: { answers: true },
        orderBy: { attemptNo: 'desc' },
      });
      if (again) return again;
      throw new BadRequestException('Could not create attempt');
    }
  }

  async saveAnswers(user: AuthUser, submissionId: string, dto: SaveAnswersDto) {
    const submission = await this.loadOwned(user, submissionId);
    if (submission.status !== SubmissionStatus.IN_PROGRESS) {
      throw new BadRequestException('Submission is not editable');
    }

    const questionIds = new Set(
      (
        await this.prisma.question.findMany({
          where: { assignmentId: submission.assignmentId },
          select: { id: true },
        })
      ).map((q) => q.id),
    );

    for (const a of dto.answers) {
      if (!questionIds.has(a.questionId)) {
        throw new BadRequestException(`Unknown question ${a.questionId}`);
      }
      await this.prisma.answer.upsert({
        where: {
          submissionId_questionId: {
            submissionId,
            questionId: a.questionId,
          },
        },
        create: {
          submissionId,
          questionId: a.questionId,
          value: a.value as object,
        },
        update: { value: a.value as object },
      });
    }

    return this.prisma.submission.findUniqueOrThrow({
      where: { id: submissionId },
      include: { answers: true },
    });
  }

  async submit(user: AuthUser, submissionId: string) {
    const submission = await this.loadOwned(user, submissionId);
    if (submission.status !== SubmissionStatus.IN_PROGRESS) {
      throw new BadRequestException('Already submitted');
    }

    const assignment = await this.prisma.assignment.findUniqueOrThrow({
      where: { id: submission.assignmentId },
      include: { questions: true },
    });

    const mode = assignment.responseMode;
    const needsFile =
      mode === AssignmentResponseMode.FILE ||
      mode === AssignmentResponseMode.QUIZ_AND_FILE;
    if (needsFile) {
      const fileCount = await this.prisma.storedFile.count({
        where: {
          ownerType: StoredFileOwnerType.SUBMISSION_ATTACHMENT,
          ownerId: submissionId,
        },
      });
      if (fileCount < 1) {
        throw new BadRequestException(
          'At least one PNG/PDF attachment is required',
        );
      }
    }

    const answers = await this.prisma.answer.findMany({
      where: { submissionId },
    });
    const byQ = new Map(answers.map((a) => [a.questionId, a]));

    let earned = 0;
    let total = 0;
    let hasOpen = false;
    // File answers always need manual review (like OPEN)
    if (needsFile) hasOpen = true;

    for (const q of assignment.questions) {
      total += q.points;
      const ans = byQ.get(q.id);
      if (q.type === QuestionType.OPEN) {
        hasOpen = true;
        continue;
      }
      if (!ans) {
        await this.prisma.answer.upsert({
          where: {
            submissionId_questionId: {
              submissionId,
              questionId: q.id,
            },
          },
          create: {
            submissionId,
            questionId: q.id,
            value: null as unknown as object,
            isCorrect: false,
            pointsAwarded: 0,
          },
          update: { isCorrect: false, pointsAwarded: 0 },
        });
        continue;
      }

      let result = { isCorrect: false, points: 0 };
      if (q.type === QuestionType.CHOICE) {
        const raw = ans.value;
        const selected = Array.isArray(raw)
          ? (raw as unknown[]).map(String)
          : raw == null || raw === ''
            ? []
            : [String(raw)];
        const keys = Array.isArray(q.correctKeys)
          ? (q.correctKeys as string[])
          : [];
        result = gradeChoice(keys, selected, q.points);
      } else if (q.type === QuestionType.SHORT) {
        const keys = Array.isArray(q.correctKeys)
          ? (q.correctKeys as string[])
          : [];
        const match =
          q.shortMatch === ShortMatch.NUMBER ? 'NUMBER' : 'EXACT';
        result = gradeShort({
          match,
          correctKeys: keys,
          answer: String(ans.value ?? ''),
          tolerance: q.numberTolerance
            ? Number(q.numberTolerance)
            : 0,
          points: q.points,
        });
      }

      earned += result.points;
      await this.prisma.answer.update({
        where: { id: ans.id },
        data: {
          isCorrect: result.isCorrect,
          pointsAwarded: result.points,
        },
      });
    }

    const scoreXp = computeScoreXp(assignment.maxXp, earned, total);
    const status = hasOpen
      ? SubmissionStatus.PENDING_REVIEW
      : SubmissionStatus.AUTO_GRADED;

    // Always keep auto-graded points/XP even when OPEN/file still needs review.
    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status,
        scorePoints: earned,
        scoreXp,
        submittedAt: new Date(),
        gradedAt: hasOpen ? null : new Date(),
      },
      include: { answers: true },
    });

    await this.audit.append({
      actorId: user.realUserId,
      targetId: user.id,
      action: AuditAction.SUBMISSION_SUBMIT,
      meta: { submissionId, status, earned, provisional: hasOpen },
    });

    // Provisional XP from auto-graded parts counts immediately; final grade adjusts delta.
    await this.xp.syncBestAttempt(
      user.id,
      assignment.courseId,
      assignment.id,
      submissionId,
    );
    await this.mastery.recomputeForUserAssignment(user.id, assignment.id);

    if (status === SubmissionStatus.PENDING_REVIEW) {
      try {
        const u = await this.prisma.user.findUnique({
          where: { id: user.id },
          select: { nickname: true },
        });
        await this.notifications.notifyStaffHwSubmitted({
          courseId: assignment.courseId,
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          submissionId,
          studentUserId: user.id,
          studentLabel: u?.nickname?.trim() || 'Ученик',
        });
      } catch (err) {
        this.logger.warn(
          `notifyStaffHwSubmitted failed for submission ${submissionId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return updated;
  }

  async listMine(user: AuthUser, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new NotFoundException();
    if (!(await this.access.hasContentAccess(user, assignment.courseId))) {
      throw new ForbiddenException();
    }
    return this.prisma.submission.findMany({
      where: { assignmentId, userId: user.id },
      include: { answers: true },
      orderBy: { attemptNo: 'asc' },
    });
  }

  async listCourse(
    actor: AuthUser,
    courseId: string,
    status?: SubmissionStatus,
  ) {
    if (!(await this.access.canManageCourse(actor, courseId))) {
      throw new ForbiddenException();
    }
    return this.prisma.submission.findMany({
      where: {
        assignment: { courseId },
        ...(status ? { status } : {}),
      },
      include: {
        answers: true,
        assignment: { select: { id: true, title: true, responseMode: true, maxXp: true } },
        user: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    }).then(async (rows) => {
      const ids = rows.map((r) => r.id);
      const files = ids.length
        ? await this.prisma.storedFile.findMany({
            where: {
              ownerType: StoredFileOwnerType.SUBMISSION_ATTACHMENT,
              ownerId: { in: ids },
            },
            select: {
              id: true,
              ownerId: true,
              originalName: true,
              mimeType: true,
              sizeBytes: true,
            },
          })
        : [];
      const bySub = new Map<string, typeof files>();
      for (const f of files) {
        const list = bySub.get(f.ownerId) ?? [];
        list.push(f);
        bySub.set(f.ownerId, list);
      }
      return rows.map((r) => ({
        ...r,
        files: (bySub.get(r.id) ?? []).map(({ ownerId: _, ...rest }) => rest),
      }));
    });
  }

  async grade(actor: AuthUser, submissionId: string, dto: GradeSubmissionDto) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: { include: { questions: true } },
        answers: true,
      },
    });
    if (!submission) throw new NotFoundException();
    if (
      !(await this.access.canManageCourse(actor, submission.assignment.courseId))
    ) {
      throw new ForbiddenException();
    }
    if (
      submission.status !== SubmissionStatus.PENDING_REVIEW &&
      submission.status !== SubmissionStatus.GRADED
    ) {
      throw new BadRequestException('Submission not ready for grading');
    }

    const byQ = new Map(
      submission.assignment.questions.map((q) => [q.id, q]),
    );
    let earned = 0;
    let total = 0;

    for (const q of submission.assignment.questions) {
      total += q.points;
      if (q.type !== QuestionType.OPEN) {
        const existing = submission.answers.find((a) => a.questionId === q.id);
        earned += existing?.pointsAwarded ?? 0;
        continue;
      }
      const grade = dto.answers.find((a) => a.questionId === q.id);
      if (!grade) {
        throw new BadRequestException(`Missing grade for ${q.id}`);
      }
      if (grade.pointsAwarded > q.points) {
        throw new BadRequestException('pointsAwarded exceeds question points');
      }
      earned += grade.pointsAwarded;
      await this.prisma.answer.upsert({
        where: {
          submissionId_questionId: {
            submissionId,
            questionId: q.id,
          },
        },
        create: {
          submissionId,
          questionId: q.id,
          value: '',
          pointsAwarded: grade.pointsAwarded,
          feedback: grade.feedback,
          isCorrect: grade.pointsAwarded >= q.points,
        },
        update: {
          pointsAwarded: grade.pointsAwarded,
          feedback: grade.feedback,
          isCorrect: grade.pointsAwarded >= q.points,
        },
      });
      void byQ;
    }

    const scoreXp =
      total <= 0 && dto.scoreXp !== undefined
        ? Math.min(dto.scoreXp, submission.assignment.maxXp)
        : computeScoreXp(submission.assignment.maxXp, earned, total);
    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: SubmissionStatus.GRADED,
        scorePoints: total <= 0 ? dto.scoreXp ?? 0 : earned,
        scoreXp,
        gradedAt: new Date(),
        gradedBy: actor.realUserId,
      },
      include: { answers: true },
    });

    await this.audit.append({
      actorId: actor.realUserId,
      targetId: submission.userId,
      action: AuditAction.SUBMISSION_GRADE,
      meta: { submissionId, scoreXp },
    });

    await this.xp.syncBestAttempt(
      submission.userId,
      submission.assignment.courseId,
      submission.assignmentId,
      submissionId,
    );
    await this.mastery.recomputeForUserAssignment(
      submission.userId,
      submission.assignmentId,
    );

    try {
      await this.notifications.notifyHwGraded({
        userId: submission.userId,
        courseId: submission.assignment.courseId,
        assignmentId: submission.assignmentId,
        assignmentTitle: submission.assignment.title,
        scoreXp,
      });
    } catch {
      /* non-blocking */
    }

    return updated;
  }

  private async loadOwned(user: AuthUser, submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.userId !== user.id) throw new ForbiddenException();
    return submission;
  }
}
