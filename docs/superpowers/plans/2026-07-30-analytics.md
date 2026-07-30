# Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add course Topics (radar axes), lesson engagement, TopicMastery/struggle from homework grades, Postgres outbox → Neo4j worker, and aggregate analytics APIs for Recharts/graph — after Homework is in place.

**Architecture:** Postgres SoT + `AnalyticsOutbox`; `OutboxProcessor` MERGEs into Neo4j when enabled. Report endpoints read Postgres caches; graph endpoint prefers Neo4j with Postgres fallback. Wire mastery recompute into submission grade path.

**Tech Stack:** NestJS 11, Prisma 7, `neo4j-driver`, `@nestjs/schedule` (or setInterval), existing JWT/RBAC, Jest, Docker Neo4j.

**Spec:** `docs/superpowers/specs/2026-07-30-analytics-design.md`  
**Depends on:** Homework plan completed (assignments, submissions, XP, AssignmentBestXp).

## Global Constraints

- Backend-only; `public/analytics.html` stub only.
- Outbox written in same Prisma transaction as domain writes.
- Struggle if best graded `scorePct < 0.25` on any tagged assignment.
- COMPLETE engagement requires `progressPct >= 90` (or type COMPLETE).
- Empty `NEO4J_URI` → Neo4j disabled; outbox still fills; graph API falls back.
- Do not change XP formulas; only consume graded submissions.
- Commit after each task on `feature/foundation-auth`.

---

## File structure

```
docker-compose.yml                 # + neo4j
.env.example                       # NEO4J_*
prisma/schema.prisma               # Topic*, LessonEngagement, TopicMastery, AnalyticsOutbox
src/topics/
src/engagement/
src/analytics/
src/outbox/
src/neo4j/                         # replace stub with driver
src/submissions/                   # hook mastery + outbox on grade
src/enrollments/                   # optional ENROLLMENT outbox
public/analytics.html + analytics.js
postman/analytics.json
test/analytics.e2e-spec.ts
```

---

### Task 1: Prisma Analytics schema + Neo4j Compose + env

**Files:**
- Modify: `prisma/schema.prisma`, `docker-compose.yml`, `.env.example`, `src/config/configuration.ts`, `src/config/env.validation.ts`
- Migration: `analytics_init`

**Interfaces:**
- Produces models: `Topic`, `LessonTopic`, `AssignmentTopic`, `LessonEngagement`, `TopicMastery`, `AnalyticsOutbox` + enums per spec §4
- Env: `NEO4J_URI?`, `NEO4J_USER`, `NEO4J_PASSWORD` (optional)

- [ ] **Step 1: Schema + migration deploy + generate.**

- [ ] **Step 2: Add neo4j service to compose**

```yaml
  neo4j:
    image: neo4j:5-community
    ports: ["7474:7474", "7687:7687"]
    environment:
      NEO4J_AUTH: neo4j/online-school-neo4j
    volumes: ["neo4jdata:/data"]
```

- [ ] **Step 3: Commit**

```bash
git add prisma docker-compose.yml .env.example src/config
git commit -m "feat: add Analytics Prisma schema and Neo4j compose service"
```

---

### Task 2: Neo4jService real driver + Outbox module

**Files:**
- Replace/expand: `src/neo4j/neo4j.service.ts`, `neo4j.module.ts`
- Create: `src/outbox/outbox.module.ts`, `outbox.service.ts`, `outbox.processor.ts`
- Install: `neo4j-driver`, `@nestjs/schedule`

**Interfaces:**
- Produces:
  - `Neo4jService.isEnabled(): boolean`
  - `Neo4jService.run(cypher: string, params?: object): Promise<unknown>`
  - `OutboxService.enqueue(tx, type: string, payload: object): Promise<void>` — use interactive transaction client
  - `OutboxProcessor` tick: claim PENDING → apply Cypher map by type → PROCESSED/FAILED

- [ ] **Step 1: npm install neo4j-driver @nestjs/schedule**

- [ ] **Step 2: Implement driver + health;** register `ScheduleModule.forRoot()` in AppModule.

- [ ] **Step 3: Implement enqueue + processor with MERGE templates for each outbox type** (TOPIC_UPSERT, LESSON_TOPIC_SET, ASSIGNMENT_TOPIC_SET, ENROLLMENT, LESSON_ENGAGEMENT, SUBMISSION_GRADED, MASTERY_UPSERT).

- [ ] **Step 4: Commit**

```bash
git add src/neo4j src/outbox src/app.module.ts package.json package-lock.json
git commit -m "feat: add Neo4j driver and analytics outbox processor"
```

---

### Task 3: Topics CRUD + tagging

**Files:**
- Create: `src/topics/*`
- Modify: `src/app.module.ts`

**Interfaces:**
- Produces Topic CRUD under `/courses/:courseId/topics`, PATCH/DELETE `/topics/:id`
- `PUT /lessons/:id/topics`, `PUT /assignments/:id/topics` — replace links; enqueue outbox TOPIC/LESSON_TOPIC/ASSIGNMENT_TOPIC
- Slug from name; manage via `canManageCourse`

- [ ] **Step 1: Implement + sanitize topic names.**

- [ ] **Step 2: Commit**

```bash
git add src/topics src/app.module.ts
git commit -m "feat: add course Topics and lesson/assignment tagging"
```

---

### Task 4: Engagement + TopicMastery service

**Files:**
- Create: `src/engagement/*`, `src/analytics/topic-mastery.service.ts` (or under `src/topics/`)
- Modify: `src/submissions/submissions.service.ts` — after full grade call mastery recompute + outbox

**Interfaces:**
- Produces:
  - `POST /lessons/:id/engagement` — upsert LessonEngagement; COMPLETE if progress≥90; outbox LESSON_ENGAGEMENT
  - `TopicMasteryService.recomputeForUserAssignment(userId, assignmentId): Promise<void>` — for each tagged topic, avg best scorePct, struggling flag, upsert TopicMastery, outbox MASTERY_UPSERT + SUBMISSION_GRADED

- [ ] **Step 1: Unit tests for mastery avg + struggle threshold 0.25.**

- [ ] **Step 2: Implement engagement + hook grade/submit paths.**

- [ ] **Step 3: Commit**

```bash
git add src/engagement src/analytics src/submissions src/topics
git commit -m "feat: add lesson engagement and topic mastery recompute"
```

---

### Task 5: Analytics report APIs

**Files:**
- Create: `src/analytics/analytics.module.ts`, `analytics.service.ts`, `analytics.controller.ts`

**Interfaces:**
- Produces routes per spec §7: radar/me, radar/:userId, cold-lessons, struggling-topics, graph
- Radar from TopicMastery ordered by Topic.sortOrder
- Cold lessons: published lessons with low complete/view rates vs active enrollment count
- Graph: Neo4j query limited to course; if disabled, build nodes/edges from Postgres (topics, lessons, assignments, struggling)

- [ ] **Step 1: Implement controller + service.**

- [ ] **Step 2: Extend `/health` with neo4j status if easy.**

- [ ] **Step 3: Commit**

```bash
git add src/analytics src/health
git commit -m "feat: add analytics radar, cold-lessons, struggling, and graph APIs"
```

---

### Task 6: Postman + HTML + e2e

**Files:**
- Create: `postman/analytics.json`, `public/analytics.html`, `public/analytics.js`, `test/analytics.e2e-spec.ts`

**Interfaces:**
- e2e: create topics → tag assignment → student engagement COMPLETE → grade &lt;25% → radar struggling true; cold-lessons returns structure; outbox PROCESSED when Neo4j available (skip soft if neo4j down)

- [ ] **Step 1: e2e PASS**

- [ ] **Step 2: HTML stub + Postman**

- [ ] **Step 3: Commit**

```bash
git add postman/analytics.json public/analytics.html public/analytics.js test/analytics.e2e-spec.ts
git commit -m "feat: add Analytics Postman collection, test UI, and e2e"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Topics + tags | 3 |
| Engagement VIEW/COMPLETE/SKIP | 4 |
| Mastery + struggle &lt;25% | 4 |
| Outbox + Neo4j worker | 2 |
| Radar / cold / struggling / graph | 5 |
| Compose Neo4j + env | 1 |
| HTML/Postman/e2e | 6 |
| Homework-first order | blocked on Homework plan |
