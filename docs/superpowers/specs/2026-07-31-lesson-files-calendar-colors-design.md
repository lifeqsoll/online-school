# Lesson Materials, Assignment Files, Video UI & Calendar Course Colors — Design Spec

**Date:** 2026-07-31  
**Status:** Draft for user review  
**Scope:** Lesson PNG/PDF materials + video staff UI; assignment materials + student file answers with response modes; calendar chip colors by course (any count of courses per day).  
**Depends on:** Catalog/storage (MinIO), homework submissions, student LK + staff CourseWorkspace.

---

## 1. Goals

- Staff can attach **PNG/PDF materials** to any lesson (including lessons linked from LIVE/webinar calendar events).
- Staff can **upload lesson video** (existing API) and set external video URL from the UI.
- Staff can attach **PNG/PDF blanks** to assignments; students can upload **PNG/PDF answers** when the assignment mode requires it.
- Assignment **response mode**: `QUIZ` | `FILE` | `QUIZ_AND_FILE` (curator chooses).
- Student calendar colors events by **course** so that when **any number** of different courses appear on the same day, their chips are visually distinct (stable color per `courseId`).

### Out of scope

- Video transcoding / CDN / HLS
- Arbitrary mime types beyond PNG/PDF for materials and submission files (video remains separate lesson pipeline)
- Hard cap on file **count** (only size/mime limits)
- Changing LIVE `meetingUrl` storage (stays on `CourseEvent`)

---

## 2. Locked decisions

| Topic | Choice |
|-------|--------|
| Storage | Existing MinIO/S3 via `StorageService` |
| File metadata | Single `StoredFile` model + `ownerType` / `ownerId` |
| Owner types | `LESSON_MATERIAL`, `ASSIGNMENT_MATERIAL`, `SUBMISSION_ATTACHMENT` |
| Lesson video | Keep `Lesson.videoSource` / `videoUrl` / `storageKey`; wire staff UI to existing endpoints |
| Assignment modes | `responseMode`: `QUIZ` (default) \| `FILE` \| `QUIZ_AND_FILE` |
| Materials + answers | Staff blanks + student file answers |
| File count | Unlimited (practical UX list); size limit **20 MB** per PNG/PDF |
| Video size | Existing **500 MB** upload limit |
| Calendar colors | Deterministic palette index from `hash(courseId)`; works for **N ≥ 1** distinct courses on a day; if N > palette length, colors cycle |
| LIVE vs DEADLINE | Still distinguishable (e.g. border/style) on top of course color |

---

## 3. Data model

### Enums

```prisma
enum StoredFileOwnerType {
  LESSON_MATERIAL
  ASSIGNMENT_MATERIAL
  SUBMISSION_ATTACHMENT
}

enum AssignmentResponseMode {
  QUIZ
  FILE
  QUIZ_AND_FILE
}
```

### `StoredFile`

| Field | Notes |
|-------|--------|
| `id` | cuid |
| `ownerType` | enum above |
| `ownerId` | lessonId / assignmentId / submissionId |
| `courseId` | denormalized for ACL listing |
| `uploadedById` | user id |
| `originalName` | display name |
| `mimeType` | `image/png` \| `application/pdf` |
| `sizeBytes` | int |
| `storageKey` | S3 key |
| `createdAt` | |

Indexes: `(ownerType, ownerId)`, `(courseId)`.

### `Assignment`

Add `responseMode AssignmentResponseMode @default(QUIZ)`.

Validation:

- `QUIZ`: questions required as today; file attachments on submit optional/ignored for requirement.
- `FILE`: at least one `SUBMISSION_ATTACHMENT` required on submit; questions not required.
- `QUIZ_AND_FILE`: questions + at least one submission file required.

---

## 4. API

### Files module (new)

| Method | Path | Who | Behavior |
|--------|------|-----|----------|
| `POST` | `/files` multipart: `file`, `ownerType`, `ownerId` | staff (lesson/assignment materials); student (own draft/in-progress submission) | validate mime/size; put S3; create `StoredFile` |
| `GET` | `/files?ownerType=&ownerId=` | access to parent resource | list metadata (no raw keys to clients needing signed URL) |
| `GET` | `/files/:id/download` | access to parent | signed GET URL (TTL like video) |
| `DELETE` | `/files/:id` | staff for materials; student for own submission file while editable | delete S3 object + row |

Allowed mime for materials/answers: `image/png`, `application/pdf`. Max 20 MB.

### Lessons (existing, UI-wired)

- `POST /lessons/:id/video/upload`
- `PATCH /lessons/:id/video/external`
- `GET /lessons/:id/playback`
- `PATCH /lessons/:id` (content/type/publish)

### Assignments / submissions

- Create/update assignment accepts `responseMode`.
- Submit validates mode vs attachments + answers.
- Review queue payload includes submission file ids/names + download links.

### ACL summary

| Owner | Upload | List/Download | Delete |
|-------|--------|---------------|--------|
| Lesson material | course manage | content access (enrolled/staff) | course manage |
| Assignment material | course manage | enrolled or manage | course manage |
| Submission attachment | owner student while editable | owner + course manage | owner while editable; manage always |

---

## 5. Frontend

### Staff `CourseWorkspace`

- Lesson edit panel: title, type, content, video upload + external URL, materials list (upload/delete PNG/PDF).
- Assignment constructor: `responseMode` select; materials block; hide/relax question builder when `FILE`.
- Review: show/download student files.

### Student

- `LkLessonPage`: video + materials list (open/download; PNG preview optional).
- Assignment take: show assignment materials; file dropzone when mode is `FILE` or `QUIZ_AND_FILE`; quiz UI when mode includes quiz.

### Calendar

- `WeekStripCalendar` / `MonthGridCalendar` (and staff multi-course views that have `course`): chip background/border from palette[`hash(courseId) % palette.length`].
- Distinct courses on the **same day** (1…N) get distinct colors when their hashes differ; collisions possible only when palette wraps — acceptable.
- Keep a secondary cue for LIVE vs DEADLINE (icon, left border style, or opacity).
- Modal/tooltip still shows course title.

---

## 6. Error handling

| Case | Response |
|------|----------|
| Wrong mime / oversize | `400` clear message |
| Missing required submission file | `400` |
| No access | `403` |
| Missing owner | `404` |
| Edit after submit locked | `400` as today for non-editable submission |

---

## 7. Test plan

- Upload/delete lesson materials; webinar-linked lesson still shows materials.
- Video upload + external + playback for enrolled student.
- Assignment modes: submit success/fail matrix for quiz/file/both.
- Student answer files visible in review; ACL denial for other students.
- Calendar: one day with **1**, **3**, and **many** courses — chips use course colors consistently after reload.

---

## 8. Implementation notes

- Prefer Nest module `files/` using existing `StorageModule`.
- S3 key pattern: `courses/{courseId}/files/{ownerType}/{ownerId}/{uuid}-{safeName}`.
- Migration for `StoredFile` + `Assignment.responseMode`.
- Fix calendar deep-link inconsistency if still present: prefer `/lk/lessons/:lessonId`.
