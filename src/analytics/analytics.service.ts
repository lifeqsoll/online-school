import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SubmissionStatus } from '@prisma/client';
import { CourseAccessService } from '../enrollments/course-access.service';
import { Neo4jService } from '../neo4j/neo4j.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../rbac/auth-user';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly neo4j: Neo4jService,
  ) {}

  async radarMe(user: AuthUser, courseId: string) {
    if (!(await this.access.hasContentAccess(user, courseId))) {
      throw new ForbiddenException();
    }
    return this.radarFor(user.id, courseId);
  }

  async radarUser(actor: AuthUser, courseId: string, userId: string) {
    const allowed =
      (await this.access.canManageCourse(actor, courseId)) ||
      this.access.isSupportOps(actor);
    if (!allowed) {
      throw new ForbiddenException();
    }
    return this.radarFor(userId, courseId);
  }

  private async radarFor(userId: string, courseId: string) {
    const modules = await this.prisma.courseModule.findMany({
      where: { courseId },
      orderBy: { sortOrder: 'asc' },
      include: {
        lessons: {
          where: { isPublished: true },
          select: { id: true },
        },
        assignments: {
          where: { isPublished: true },
          select: {
            id: true,
            maxXp: true,
            questions: { select: { points: true } },
          },
        },
      },
    });

    // Lesson-scoped HW that belongs to lessons in these modules
    const lessonIds = modules.flatMap((m) => m.lessons.map((l) => l.id));
    const lessonAssignments =
      lessonIds.length === 0
        ? []
        : await this.prisma.assignment.findMany({
            where: {
              courseId,
              isPublished: true,
              lessonId: { in: lessonIds },
            },
            select: {
              id: true,
              lessonId: true,
              maxXp: true,
              questions: { select: { points: true } },
            },
          });

    const lessonToModule = new Map<string, string>();
    for (const m of modules) {
      for (const l of m.lessons) lessonToModule.set(l.id, m.id);
    }

    const hwByModule = new Map<
      string,
      Array<{
        id: string;
        maxXp: number;
        totalPoints: number;
      }>
    >();
    for (const m of modules) {
      hwByModule.set(
        m.id,
        m.assignments.map((a) => ({
          id: a.id,
          maxXp: a.maxXp,
          totalPoints: a.questions.reduce((s, q) => s + q.points, 0),
        })),
      );
    }
    for (const a of lessonAssignments) {
      if (!a.lessonId) continue;
      const moduleId = lessonToModule.get(a.lessonId);
      if (!moduleId) continue;
      const list = hwByModule.get(moduleId) ?? [];
      if (list.some((x) => x.id === a.id)) continue;
      list.push({
        id: a.id,
        maxXp: a.maxXp,
        totalPoints: a.questions.reduce((s, q) => s + q.points, 0),
      });
      hwByModule.set(moduleId, list);
    }

    const allLessonIds = modules.flatMap((m) => m.lessons.map((l) => l.id));
    const allHwIds = [...hwByModule.values()].flatMap((list) =>
      list.map((a) => a.id),
    );

    const [engagements, submissions, bonuses] = await Promise.all([
      allLessonIds.length
        ? this.prisma.lessonEngagement.findMany({
            where: { userId, lessonId: { in: allLessonIds } },
            select: {
              lessonId: true,
              completedAt: true,
              maxProgressPct: true,
            },
          })
        : Promise.resolve([]),
      allHwIds.length
        ? this.prisma.submission.findMany({
            where: {
              userId,
              assignmentId: { in: allHwIds },
              status: {
                in: [
                  SubmissionStatus.AUTO_GRADED,
                  SubmissionStatus.GRADED,
                  SubmissionStatus.PENDING_REVIEW,
                ],
              },
              OR: [{ scoreXp: { not: null } }, { scorePoints: { not: null } }],
            },
            select: {
              assignmentId: true,
              scoreXp: true,
              scorePoints: true,
            },
          })
        : Promise.resolve([]),
      this.prisma.radarBonus.findMany({
        where: { userId, courseId },
        select: { moduleId: true, pointsDelta: true },
      }),
    ]);

    const bonusByModule = new Map<string, number>();
    for (const b of bonuses) {
      bonusByModule.set(
        b.moduleId,
        (bonusByModule.get(b.moduleId) ?? 0) + b.pointsDelta,
      );
    }

    const lessonDone = new Set(
      engagements
        .filter((e) => e.completedAt != null || e.maxProgressPct >= 80)
        .map((e) => e.lessonId),
    );

    const bestPctByHw = new Map<string, number>();
    const hwMeta = new Map(
      [...hwByModule.values()].flatMap((list) => list.map((a) => [a.id, a])),
    );
    for (const s of submissions) {
      const meta = hwMeta.get(s.assignmentId);
      if (!meta) continue;
      let pct = 0;
      if (meta.totalPoints > 0 && s.scorePoints != null) {
        pct = (s.scorePoints / meta.totalPoints) * 100;
      } else if (meta.maxXp > 0 && s.scoreXp != null) {
        pct = (s.scoreXp / meta.maxXp) * 100;
      }
      const prev = bestPctByHw.get(s.assignmentId) ?? 0;
      if (pct > prev) bestPctByHw.set(s.assignmentId, pct);
    }

    const labels: string[] = [];
    const values: number[] = [];
    const scaleValues: number[] = [];
    const moduleIds: string[] = [];
    const details: Array<{
      moduleId: string;
      earned: number;
      total: number;
      lessonsDone: number;
      lessonsTotal: number;
      hwDone: number;
      hwTotal: number;
    }> = [];

    for (const m of modules) {
      const lessons = m.lessons;
      const hw = hwByModule.get(m.id) ?? [];
      const total = lessons.length + hw.length;
      const lessonsDone = lessons.filter((l) => lessonDone.has(l.id)).length;
      const hwDone = hw.filter((a) => (bestPctByHw.get(a.id) ?? 0) >= 75)
        .length;
      const earned = lessonsDone + hwDone;
      const basePct = total === 0 ? 0 : Math.round((earned / total) * 100);
      const bonus = bonusByModule.get(m.id) ?? 0;
      const pct = Math.max(0, Math.min(100, basePct + bonus));
      labels.push((m.radarLabel?.trim() || m.title).trim());
      values.push(pct);
      scaleValues.push(Math.round((pct / 100) * 8 * 10) / 10);
      moduleIds.push(m.id);
      details.push({
        moduleId: m.id,
        earned,
        total,
        lessonsDone,
        lessonsTotal: lessons.length,
        hwDone,
        hwTotal: hw.length,
      });
    }

    return {
      labels,
      values,
      scaleValues,
      scaleMax: 8,
      moduleIds,
      details,
      struggling: values.map((v) => v > 0 && v < 40),
    };
  }

  async coldLessons(actor: AuthUser, courseId: string) {
    if (!(await this.access.canManageCourse(actor, courseId))) {
      throw new ForbiddenException();
    }
    const enrolled = await this.prisma.enrollment.count({
      where: { courseId, status: 'ACTIVE' },
    });
    const lessons = await this.prisma.lesson.findMany({
      where: { module: { courseId }, isPublished: true },
      select: { id: true, title: true },
    });
    const engagements = await this.prisma.lessonEngagement.groupBy({
      by: ['lessonId'],
      where: { courseId },
      _count: { _all: true },
    });
    const completed = await this.prisma.lessonEngagement.groupBy({
      by: ['lessonId'],
      where: { courseId, completedAt: { not: null } },
      _count: { _all: true },
    });
    const viewMap = new Map(
      engagements.map((e) => [e.lessonId, e._count._all]),
    );
    const completeMap = new Map(
      completed.map((e) => [e.lessonId, e._count._all]),
    );
    const denom = Math.max(enrolled, 1);
    return lessons
      .map((l) => {
        const views = viewMap.get(l.id) ?? 0;
        const completes = completeMap.get(l.id) ?? 0;
        return {
          lessonId: l.id,
          title: l.title,
          views,
          completes,
          completeRate: completes / denom,
        };
      })
      .sort((a, b) => a.completeRate - b.completeRate);
  }

  async strugglingTopics(actor: AuthUser, courseId: string) {
    if (!(await this.access.canManageCourse(actor, courseId))) {
      throw new ForbiddenException();
    }
    const topics = await this.prisma.topic.findMany({
      where: { courseId },
      orderBy: { sortOrder: 'asc' },
    });
    const rows = await this.prisma.topicMastery.groupBy({
      by: ['topicId'],
      where: { courseId, struggling: true },
      _count: { _all: true },
    });
    const map = new Map(rows.map((r) => [r.topicId, r._count._all]));
    return topics.map((t) => ({
      topicId: t.id,
      name: t.name,
      strugglingStudents: map.get(t.id) ?? 0,
    }));
  }

  async graph(actor: AuthUser, courseId: string) {
    if (!(await this.access.canManageCourse(actor, courseId))) {
      throw new ForbiddenException();
    }
    if (this.neo4j.isEnabled()) {
      try {
        const nodes = await this.neo4j.run(
          `MATCH (n) WHERE n.courseId = $courseId OR (n:User)
           OPTIONAL MATCH (n)-[r]->(m)
           WHERE m.courseId = $courseId OR m:Topic OR m:Lesson OR m:Assignment OR m:Course
           RETURN n, r, m LIMIT 500`,
          { courseId },
        );
        if (nodes.length) {
          return { source: 'neo4j', records: nodes };
        }
      } catch {
        /* fallback */
      }
    }
    return this.postgresGraph(courseId);
  }

  private async postgresGraph(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException();
    const topics = await this.prisma.topic.findMany({ where: { courseId } });
    const lessons = await this.prisma.lesson.findMany({
      where: { module: { courseId } },
      include: { topicLinks: true },
    });
    const assignments = await this.prisma.assignment.findMany({
      where: { courseId },
      include: { topicLinks: true },
    });
    const struggling = await this.prisma.topicMastery.findMany({
      where: { courseId, struggling: true },
      select: { userId: true, topicId: true },
    });
    return {
      source: 'postgres',
      nodes: [
        { type: 'Course', id: courseId },
        ...topics.map((t) => ({ type: 'Topic', id: t.id, name: t.name })),
        ...lessons.map((l) => ({ type: 'Lesson', id: l.id, title: l.title })),
        ...assignments.map((a) => ({
          type: 'Assignment',
          id: a.id,
          title: a.title,
        })),
      ],
      edges: [
        ...lessons.flatMap((l) =>
          l.topicLinks.map((tl) => ({
            from: l.id,
            to: tl.topicId,
            type: 'COVERS',
          })),
        ),
        ...assignments.flatMap((a) =>
          a.topicLinks.map((tl) => ({
            from: a.id,
            to: tl.topicId,
            type: 'TESTS',
          })),
        ),
        ...struggling.map((s) => ({
          from: s.userId,
          to: s.topicId,
          type: 'STRUGGLING_WITH',
        })),
      ],
    };
  }
}
