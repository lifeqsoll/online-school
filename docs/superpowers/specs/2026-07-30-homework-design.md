# Homework: Assignments, Grading & XP — Design Spec

**Date:** 2026-07-30  
**Status:** Draft for user review  
**Scope:** Backend Homework slice on top of Catalog. No production React app. Test via HTML console + Postman/cURL.  
**Depends on:**  
- `docs/superpowers/specs/2026-07-30-foundation-auth-design.md`  
- `docs/superpowers/specs/2026-07-30-catalog-design.md`

---

## 1. Goals

Build homework and gamification for the olympiad online school:

- **Assignment constructor** for curators: questions of types CHOICE, SHORT (auto-grade), OPEN (manual grade)
- **Scopes:** primarily attached to a **lesson**, plus **module** and **course** level (e.g. mid-module tests)
- **Submissions** with multiple attempts; XP awarded for the **best** fully graded attempt
- **Per-course XP** balance and **course leaderboard**
- Reuse Catalog access (`enrolled` / curator / admin) and existing sanitize / audit patterns

### Out of scope

- File upload of solutions / code judge
- Neo4j sync, Topics, radar (“роза ветров”) — Analytics slice
- Hard enforcement of `dueAt` (field may exist; blocking later)
- Manual XP adjust endpoint (v1: XP only via graded attempts)
- Production React UI (HTML stub + Postman only)
- Real-time websockets for grade notifications

---

## 2. Locked decisions

| Topic | Choice |
|-------|--------|
| Architecture | Extend NestJS modular monolith |
| Attachment | Scope `LESSON` \| `MODULE` \| `COURSE`; always store `courseId` for access/XP |
| Auto-grade types | CHOICE (single/multi) + SHORT (exact string or number + tolerance) |
| Manual type | OPEN (essay / free text); curator grades points |
| Attempts | Multiple; `maxAttempts` nullable = unlimited |
| XP award | Best fully graded attempt per assignment; delta to course balance |
| XP scope | Per course (`XpBalance` on `(userId, courseId)`) |
| Leaderboard | Top by `totalXp` on course |
| When XP applies | Only when attempt status is fully graded (`AUTO_GRADED` or `GRADED`); no XP while `PENDING_REVIEW` |
| Correct keys | Never returned to students; visible to curator/admin |

---

## 3. NestJS modules

```
src/
  assignments/   # CRUD assignments + questions replace
  submissions/   # attempts, save answers, submit, grade queue
  xp/            # balance, leaderboard, ledger writes (called from submissions)
```

Reuse: `CourseAccessService`, `AuditService`, sanitize pipe, JWT/RBAC, impersonation (curator acts as student).

### Permission matrix

| Action | STUDENT (enrolled) | Course curator | ADMIN |
|--------|--------------------|----------------|-------|
| Create/update assignment & questions | no | yes (own course) | yes |
| List assignments | published only | all | all |
| Get assignment detail | published, no correctKeys | with correctKeys | with correctKeys |
| Start/save/submit attempt | yes | via impersonation | yes |
| View own attempts | yes | — | yes |
| Pending review queue / grade | no | own course | yes |
| XP me | yes | own course students* | yes |
| Course leaderboard | yes | yes | yes |

\*Curator views student XP via impersonation or future analytics; v1: `GET .../xp/me` is for the effective user (impersonated student OK).

---

## 4. Data model (Prisma)

### Enums

```prisma
enum AssignmentScope {
  LESSON
  MODULE
  COURSE
}

enum QuestionType {
  CHOICE
  SHORT
  OPEN
}

enum ShortMatch {
  EXACT
  NUMBER
}

enum SubmissionStatus {
  IN_PROGRESS
  SUBMITTED
  AUTO_GRADED
  PENDING_REVIEW
  GRADED
}

enum XpReason {
  BEST_ATTEMPT
}
```

### Assignment

- `id`, `courseId` (always set)
- `scope` + exactly one of: `lessonId`, `moduleId`, or none extra for `COURSE` (course is `courseId`)
- For `LESSON`: `lessonId` required; course derived from lesson→module→course (stored denormalized)
- For `MODULE`: `moduleId` required; `courseId` from module
- For `COURSE`: only `courseId`
- `title`, `description?`, `maxXp Int`, `maxAttempts Int?`, `isPublished Boolean`, `sortOrder`, `dueAt DateTime?`
- `questions Question[]`, `submissions Submission[]`

Constraint (app-level + DB check if practical): scope FKs match scope enum.

### Question

- `assignmentId`, `type`, `prompt`, `sortOrder`, `points Int`
- `options Json?` — CHOICE: `[{ "id": "a", "text": "..." }]`
- `correctKeys Json?` — CHOICE: `["a","c"]`; SHORT: `["42"]` (normalized forms allowed as multiple acceptable)
- `shortMatch ShortMatch?`, `numberTolerance Decimal?` — SHORT only
- Student payloads strip `correctKeys`

### Submission

- `assignmentId`, `userId`, `attemptNo Int`
- `status`, `scorePoints Int?`, `scoreXp Int?`
- `submittedAt?`, `gradedAt?`, `gradedBy?`
- `answers Answer[]`
- `@@unique([assignmentId, userId, attemptNo])`

### Answer

- `submissionId`, `questionId`
- `value Json` — choice id(s), string, or open text
- `isCorrect Boolean?`, `pointsAwarded Int?`, `feedback String?`

### XpBalance

- `userId`, `courseId`, `totalXp Int @default(0)`, `updatedAt`
- `@@unique([userId, courseId])`

### XpLedger

- `id`, `userId`, `courseId`, `assignmentId`, `submissionId?`
- `deltaXp Int`, `reason XpReason`, `createdAt`
- Append-only audit of XP changes

### Relations to add on existing models

- `Course`: `assignments`, `xpBalances`
- `CourseModule` / `Lesson`: optional back-relations to assignments
- `User`: `submissions`, `xpBalances`, `xpLedgers`
- `AuditAction`: add `ASSIGNMENT_CREATE`, `ASSIGNMENT_UPDATE`, `SUBMISSION_SUBMIT`, `SUBMISSION_GRADE`

---

## 5. Grading & XP rules

### Auto-grade

- **CHOICE:** selected option id set equals `correctKeys` set (order-independent). Full `points` or 0 (no partial for multi unless later).
- **SHORT + EXACT:** normalize trim + case-fold; match any of `correctKeys`.
- **SHORT + NUMBER:** parse float; match if `|answer - expected| <= numberTolerance` (default `0`) against any numeric key.
- **OPEN:** no auto points; wait for curator.

### Submit transition

1. Require `IN_PROGRESS` (or allow submit on create+answers in one call — v1: create attempt → patch answers → submit).
2. Persist answers; run auto-grade on CHOICE/SHORT.
3. If any OPEN without grade → `PENDING_REVIEW`; else → `AUTO_GRADED` (treat as fully graded).
4. Compute `scorePoints` = sum `pointsAwarded`; `scoreXp = round(maxXp * scorePoints / totalPoints)` (0 if totalPoints=0).
5. Call XP sync only if status is `AUTO_GRADED` or (after manual grade) `GRADED`.

### Manual grade

`POST /submissions/:id/grade` body: `{ answers: [{ questionId, pointsAwarded, feedback? }] }` for OPEN questions (and optional override).  
Sets `GRADED`, recomputes scoreXp, then XP sync.

### Best-attempt XP sync

**Locked for v1:** table `AssignmentBestXp` (`userId`, `assignmentId`, `bestXp`, `submissionId?`) with `@@unique([userId, assignmentId])`.

On each transition to a fully graded status (`AUTO_GRADED` | `GRADED`):

```
oldBest = AssignmentBestXp.bestXp or 0
newBest = max(scoreXp over all fully graded submissions for this user+assignment)
delta = newBest - oldBest   // may be negative on regrade
update AssignmentBestXp
if delta != 0:
  append XpLedger(delta)
  XpBalance.totalXp += delta
```

This keeps the course leaderboard aligned after regrades.

---

## 6. HTTP API

### Assignments

| Method | Path | Auth |
|--------|------|------|
| POST | `/courses/:courseId/assignments` | curator/admin |
| GET | `/courses/:courseId/assignments` | enrolled sees published; manage sees all |
| GET | `/assignments/:id` | content access; strip keys for students |
| PATCH | `/assignments/:id` | manage |
| PUT | `/assignments/:id/questions` | manage; reject if any submission exists (force new assignment version later) |

Create body includes `scope`, target id (`lessonId` / `moduleId`), `title`, `maxXp`, `maxAttempts?`, `questions?` optional on create or via PUT.

### Submissions

| Method | Path | Auth |
|--------|------|------|
| POST | `/assignments/:id/submissions` | enrolled; enforce maxAttempts |
| PATCH | `/submissions/:id` | owner; only `IN_PROGRESS` |
| POST | `/submissions/:id/submit` | owner |
| GET | `/assignments/:id/submissions/me` | owner |
| GET | `/courses/:courseId/submissions?status=` | manage |
| POST | `/submissions/:id/grade` | manage |

### XP

| Method | Path | Auth |
|--------|------|------|
| GET | `/courses/:courseId/xp/me` | content access |
| GET | `/courses/:courseId/leaderboard?limit=20` | content access |

Leaderboard item: `{ rank, userId, displayName, totalXp }` — `displayName` from decrypted first/last or fallback `User`.

---

## 7. Security

- Sanitize `prompt`, OPEN `value`, `feedback`, assignment `description`
- Never expose `correctKeys` / internal grade keys on student-facing DTOs
- Throttle submit endpoints lightly (existing global throttler OK)
- Impersonation: submissions attributed to effective `user.id` (impersonated student); `gradedBy` = real curator id when grading

---

## 8. Testing & stubs

- Unit: SHORT/CHOICE graders; XP best + negative regrade delta
- e2e: lesson assignment auto-only → XP + leaderboard; mixed OPEN → pending → grade → XP; module-scoped assignment
- `public/homework.html` + `public/homework.js`
- `postman/homework.json`

---

## 9. Bridge to Analytics (not implemented here)

Homework emits domain facts Analytics will consume later:

- Submission graded / lesson viewed (Catalog may add view events in Analytics)
- Assignment ↔ Topic tagging deferred to Analytics `Topic` model

No Neo4j writes in this slice.
