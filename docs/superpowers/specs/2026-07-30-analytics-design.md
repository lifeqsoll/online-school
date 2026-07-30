# Analytics: Engagement, Topics, Neo4j & Radar — Design Spec

**Date:** 2026-07-30  
**Status:** Draft for user review  
**Scope:** Backend Analytics slice on top of Catalog + Homework. No production React. Test via HTML + Postman/cURL + e2e.  
**Depends on:**  
- `docs/superpowers/specs/2026-07-30-foundation-auth-design.md`  
- `docs/superpowers/specs/2026-07-30-catalog-design.md`  
- `docs/superpowers/specs/2026-07-30-homework-design.md`

---

## 1. Goals

- **Topics** per course as custom radar axes; tag lessons and assignments
- **Lesson engagement:** VIEW + COMPLETE (≥90% progress) + SKIP
- **Homework signal:** best graded attempt; if `scorePct < 0.25` (≥75% wrong) → struggling on assignment topics (“минус”)
- **Postgres** source of truth + caches (`TopicMastery`, engagement aggregates)
- **Outbox → Neo4j** async graph for curator graph views / React Flow later
- Aggregate APIs shaped for **Recharts** radar and cold-lesson / struggling reports

### Out of scope

- Production React / React Flow UI
- Realtime websocket dashboards
- Raw engagement event firehose (aggregates + outbox only)
- Changing Homework XP rules (consume graded submissions only)

---

## 2. Locked decisions

| Topic | Choice |
|-------|--------|
| Architecture | Postgres SoT + Outbox worker → Neo4j; report APIs prefer Postgres |
| Radar axes | Course `Topic` entities; tag lessons/assignments |
| Lesson engagement | VIEW + COMPLETE (`progressPct >= 90`) + SKIP |
| Homework minus | Best fully graded attempt; `scorePct < 0.25` → `struggling` on tagged topics |
| Mastery | Average best `scorePct` across tagged graded assignments (0–100) |
| Neo4j down | Outbox accumulates; graph API falls back to Postgres skeleton |
| Sync | Same Prisma transaction writes domain row + outbox row |

---

## 3. NestJS modules

```
src/
  topics/          # Topic CRUD + lesson/assignment tagging
  engagement/      # lesson engagement endpoint + aggregates
  analytics/       # radar, cold-lessons, struggling, graph export
  outbox/          # AnalyticsOutbox writer + OutboxProcessor
  neo4j/           # real driver when NEO4J_URI set; else disabled
```

Homework/Catalog call `OutboxService.enqueue` / `TopicMasteryService.recompute` on grade and tag changes.

### Permissions

| Action | Student | Curator | Admin |
|--------|---------|---------|-------|
| Manage topics / tags | no | own course | yes |
| Post own engagement | enrolled | via impersonation | yes |
| radar/me | enrolled | — | yes |
| radar/:userId, cold-lessons, struggling, graph | no | own course | yes |

---

## 4. Data model (Postgres)

### Enums

```prisma
enum EngagementEventType {
  VIEW
  COMPLETE
  SKIP
}

enum OutboxStatus {
  PENDING
  PROCESSED
  FAILED
}
```

### Topic

- `id`, `courseId`, `name`, `slug`, `sortOrder`, timestamps  
- `lessonLinks LessonTopic[]`, `assignmentLinks AssignmentTopic[]`

### LessonTopic / AssignmentTopic

- Composite unique `(lessonId, topicId)` / `(assignmentId, topicId)`

### LessonEngagement

- `userId`, `lessonId`, `courseId`
- `viewedAt?`, `completedAt?`, `skippedAt?`, `maxProgressPct Int @default(0)`
- `@@unique([userId, lessonId])`

No mandatory raw event table in v1.

### TopicMastery

- `userId`, `courseId`, `topicId`
- `scorePct Int` (0–100)
- `struggling Boolean`
- `updatedAt`
- `@@unique([userId, topicId])`

### AnalyticsOutbox

- `id`, `type String`, `payload Json`
- `status OutboxStatus @default(PENDING)`
- `attempts Int @default(0)`, `lastError String?`
- `createdAt`, `processedAt?`
- `@@index([status, createdAt])`

### Homework / Catalog bridges

- Assignment create/update accepts optional `topicIds` (or separate PUT)
- On full grade → recompute mastery for affected topics + outbox `SUBMISSION_GRADED`
- Enrollment create → outbox `ENROLLMENT` (optional but useful for graph)

---

## 5. Neo4j + worker

### Compose

- Service `neo4j:5` — ports `7474`, `7687`; volume for data  
- Env: `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` (empty URI = disabled)

### Graph

```
(:User {id})
(:Course {id})
(:Lesson {id, courseId})
(:Assignment {id, courseId})
(:Topic {id, courseId, name})

(User)-[:ENROLLED_IN]->(Course)
(User)-[:VIEWED {at, progressPct}]->(Lesson)
(User)-[:COMPLETED {at}]->(Lesson)
(User)-[:SKIPPED {at}]->(Lesson)
(User)-[:SUBMITTED {scorePct, at, struggling}]->(Assignment)
(Lesson)-[:COVERS]->(Topic)
(Assignment)-[:TESTS]->(Topic)
(User)-[:STRUGGLING_WITH {weight, updatedAt}]->(Topic)
```

### Outbox types

`TOPIC_UPSERT`, `LESSON_TOPIC_SET`, `ASSIGNMENT_TOPIC_SET`, `ENROLLMENT`, `LESSON_ENGAGEMENT`, `SUBMISSION_GRADED`, `MASTERY_UPSERT`

### Worker

- Poll every ~2s, batch size ~50  
- Idempotent MERGE Cypher  
- On failure: `attempts++`, `lastError`; after max attempts mark `FAILED` (manual replay later)  
- Does not block HTTP request path

---

## 6. Mastery / struggle formulas

For user U and topic T:

1. Find assignments tagged with T where U has a fully graded best attempt (`AssignmentBestXp` / max `scoreXp` attempt).  
2. For each: `scorePct = scorePoints / totalQuestionPoints` (0 if total=0).  
3. `TopicMastery.scorePct = round(avg(scorePct) * 100)` over those assignments; if none → `scorePct = 0`, `struggling = false` (no data ≠ struggle).  
4. `struggling = true` if **any** such best `scorePct < 0.25`.  
5. Outbox `MASTERY_UPSERT` + Neo4j `STRUGGLING_WITH` when struggling (else remove relationship).

Radar payload:

```json
{
  "labels": ["Алгебра", "Комбинаторика", "..."],
  "values": [72, 30, 55],
  "struggling": [false, true, false]
}
```

### Cold lessons

Among published lessons in course: rank by low `VIEW` or `COMPLETE` count relative to active enrollments (e.g. `completeRate = completes / enrolled`). Return bottom N with counts.

---

## 7. HTTP API

| Method | Path | Notes |
|--------|------|-------|
| POST | `/courses/:courseId/topics` | manage |
| GET | `/courses/:courseId/topics` | content access |
| PATCH/DELETE | `/topics/:id` | manage |
| PUT | `/lessons/:id/topics` | `{ topicIds: string[] }` |
| PUT | `/assignments/:id/topics` | `{ topicIds: string[] }` |
| POST | `/lessons/:id/engagement` | `{ type, progressPct? }` |
| GET | `/courses/:courseId/analytics/radar/me` | student |
| GET | `/courses/:courseId/analytics/radar/:userId` | manage |
| GET | `/courses/:courseId/analytics/cold-lessons` | manage |
| GET | `/courses/:courseId/analytics/struggling-topics` | manage |
| GET | `/courses/:courseId/analytics/graph` | Neo4j or Postgres fallback |

---

## 8. Testing & stubs

- Unit: mastery avg + struggle threshold 0.25  
- e2e: topics → tag HW → grade &lt;25% → radar struggling; engagement COMPLETE; outbox processed when Neo4j up  
- `public/analytics.html`, `postman/analytics.json`  
- Health: Neo4j status in `/health` if enabled

---

## 9. Implementation order note

Implement **Homework first** (assignments, grade, XP), then Analytics (topics can land in Homework migration as empty tables, or Analytics migration adds tagging). Prefer: Homework plan without Topics; Analytics migration adds Topic* + outbox + engagement + wiring into grade path.
