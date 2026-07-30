import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxStatus } from '@prisma/client';
import { Neo4jService } from '../neo4j/neo4j.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_ATTEMPTS = 8;

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly neo4j: Neo4jService,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async tick() {
    if (this.busy || !this.neo4j.isEnabled()) return;
    this.busy = true;
    try {
      const batch = await this.prisma.analyticsOutbox.findMany({
        where: { status: OutboxStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      for (const row of batch) {
        try {
          await this.apply(row.type, row.payload as Record<string, unknown>);
          await this.prisma.analyticsOutbox.update({
            where: { id: row.id },
            data: {
              status: OutboxStatus.PROCESSED,
              processedAt: new Date(),
              lastError: null,
            },
          });
        } catch (e) {
          const attempts = row.attempts + 1;
          const msg = e instanceof Error ? e.message : String(e);
          await this.prisma.analyticsOutbox.update({
            where: { id: row.id },
            data: {
              attempts,
              lastError: msg.slice(0, 1000),
              status:
                attempts >= MAX_ATTEMPTS
                  ? OutboxStatus.FAILED
                  : OutboxStatus.PENDING,
            },
          });
          this.logger.warn(`Outbox ${row.id} failed: ${msg}`);
        }
      }
    } finally {
      this.busy = false;
    }
  }

  private async apply(type: string, p: Record<string, unknown>) {
    switch (type) {
      case 'TOPIC_UPSERT':
        await this.neo4j.run(
          `MERGE (t:Topic {id: $id}) SET t.courseId=$courseId, t.name=$name`,
          p,
        );
        break;
      case 'LESSON_TOPIC_SET': {
        const lessonId = String(p.lessonId);
        const topicIds = (p.topicIds as string[]) ?? [];
        await this.neo4j.run(
          `MERGE (l:Lesson {id: $lessonId}) SET l.courseId=$courseId
           WITH l
           OPTIONAL MATCH (l)-[r:COVERS]->(:Topic) DELETE r`,
          { lessonId, courseId: p.courseId },
        );
        for (const topicId of topicIds) {
          await this.neo4j.run(
            `MERGE (l:Lesson {id: $lessonId})
             MERGE (t:Topic {id: $topicId})
             MERGE (l)-[:COVERS]->(t)`,
            { lessonId, topicId },
          );
        }
        break;
      }
      case 'ASSIGNMENT_TOPIC_SET': {
        const assignmentId = String(p.assignmentId);
        const topicIds = (p.topicIds as string[]) ?? [];
        await this.neo4j.run(
          `MERGE (a:Assignment {id: $assignmentId}) SET a.courseId=$courseId
           WITH a
           OPTIONAL MATCH (a)-[r:TESTS]->(:Topic) DELETE r`,
          { assignmentId, courseId: p.courseId },
        );
        for (const topicId of topicIds) {
          await this.neo4j.run(
            `MERGE (a:Assignment {id: $assignmentId})
             MERGE (t:Topic {id: $topicId})
             MERGE (a)-[:TESTS]->(t)`,
            { assignmentId, topicId },
          );
        }
        break;
      }
      case 'ENROLLMENT':
        await this.neo4j.run(
          `MERGE (u:User {id: $userId})
           MERGE (c:Course {id: $courseId})
           MERGE (u)-[:ENROLLED_IN]->(c)`,
          p,
        );
        break;
      case 'LESSON_ENGAGEMENT': {
        await this.neo4j.run(
          `MERGE (u:User {id: $userId})
           MERGE (l:Lesson {id: $lessonId}) SET l.courseId=$courseId`,
          p,
        );
        if (p.viewed) {
          await this.neo4j.run(
            `MATCH (u:User {id: $userId}), (l:Lesson {id: $lessonId})
             MERGE (u)-[r:VIEWED]->(l)
             SET r.at=datetime(), r.progressPct=$progressPct`,
            p,
          );
        }
        if (p.completed) {
          await this.neo4j.run(
            `MATCH (u:User {id: $userId}), (l:Lesson {id: $lessonId})
             MERGE (u)-[r:COMPLETED]->(l) SET r.at=datetime()`,
            p,
          );
        }
        if (p.skipped) {
          await this.neo4j.run(
            `MATCH (u:User {id: $userId}), (l:Lesson {id: $lessonId})
             MERGE (u)-[r:SKIPPED]->(l) SET r.at=datetime()`,
            p,
          );
        }
        break;
      }
      case 'SUBMISSION_GRADED':
        await this.neo4j.run(
          `MERGE (u:User {id: $userId})
           MERGE (a:Assignment {id: $assignmentId}) SET a.courseId=$courseId
           MERGE (u)-[r:SUBMITTED]->(a)
           SET r.scorePct=$scorePct, r.at=datetime(), r.struggling=$struggling`,
          p,
        );
        break;
      case 'MASTERY_UPSERT':
        await this.neo4j.run(
          `MERGE (u:User {id: $userId})
           MERGE (t:Topic {id: $topicId}) SET t.courseId=$courseId, t.name=coalesce(t.name, $topicName)
           WITH u, t
           OPTIONAL MATCH (u)-[r:STRUGGLING_WITH]->(t) DELETE r`,
          p,
        );
        if (p.struggling) {
          await this.neo4j.run(
            `MATCH (u:User {id: $userId}), (t:Topic {id: $topicId})
             MERGE (u)-[r:STRUGGLING_WITH]->(t)
             SET r.weight=1, r.updatedAt=datetime()`,
            p,
          );
        }
        break;
      default:
        this.logger.warn(`Unknown outbox type ${type}`);
    }
  }
}
