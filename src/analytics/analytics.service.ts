import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    if (!(await this.access.canManageCourse(actor, courseId))) {
      throw new ForbiddenException();
    }
    return this.radarFor(userId, courseId);
  }

  private async radarFor(userId: string, courseId: string) {
    const topics = await this.prisma.topic.findMany({
      where: { courseId },
      orderBy: { sortOrder: 'asc' },
    });
    const masteries = await this.prisma.topicMastery.findMany({
      where: { userId, courseId },
    });
    const byTopic = new Map(masteries.map((m) => [m.topicId, m]));
    return {
      labels: topics.map((t) => t.name),
      values: topics.map((t) => byTopic.get(t.id)?.scorePct ?? 0),
      struggling: topics.map((t) => byTopic.get(t.id)?.struggling ?? false),
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
