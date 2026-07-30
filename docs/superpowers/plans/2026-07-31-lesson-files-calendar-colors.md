# Lesson Files, Assignment Modes & Calendar Colors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff attach PNG/PDF + video to lessons, attach PNG/PDF blanks to assignments, let students upload PNG/PDF answers by assignment `responseMode`, and color calendar chips by course for any number of courses on a day.

**Architecture:** Add `StoredFile` + MinIO keys via existing `StorageService`. New Nest `files` module owns upload/list/download/delete with ACL by owner type. Extend `Assignment.responseMode` and submission submit validation. Wire staff/student React UI; calendar uses deterministic `hash(courseId)` palette.

**Tech Stack:** NestJS 11, Prisma 7, MinIO/S3, React 19, Vite, Ant Design 5, TanStack Query, framer-motion (existing).

**Spec:** `docs/superpowers/specs/2026-07-31-lesson-files-calendar-colors-design.md`

## Global Constraints

- PNG/PDF only for `StoredFile` materials/answers; max **20 MB** each; no hard file-count cap.
- Lesson video stays on `Lesson.videoSource` / `videoUrl` / `storageKey` (existing endpoints, 500 MB).
- `responseMode`: `QUIZ` (default) | `FILE` | `QUIZ_AND_FILE`.
- Calendar: color by `course.id` for **N ≥ 1** courses on a day; LIVE vs DEADLINE still distinguishable.
- Product name «Олимпиадная школа»; accent `#beaaf2`.
- Commit after each task on `feature/foundation-auth`.

---

## File structure

```
prisma/schema.prisma
prisma/migrations/..._stored_files_response_mode/
src/storage/storage.service.ts              # buildFileKey + deleteObject
src/files/
  files.module.ts
  files.controller.ts
  files.service.ts
  files.mime.ts                             # ALLOWED_MIMES + assertPngOrPdf
  dto/upload-file.dto.ts
src/app.module.ts
src/assignments/dto/assignment.dto.ts       # responseMode
src/assignments/assignments.service.ts
src/submissions/submissions.service.ts      # submit validation + review files
src/assignments/... ReviewQueue data path
test/files.e2e-spec.ts
test/homework.e2e-spec.ts                   # mode submit matrix
web/src/shared/files/FileList.tsx
web/src/shared/files/FileUploadButton.tsx
web/src/shared/schedule/courseColor.ts
web/src/features/schedule/WeekStripCalendar.tsx
web/src/features/courses/LessonEditPanel.tsx
web/src/features/courses/CourseWorkspace.tsx
web/src/features/assignments/AssignmentConstructor.tsx
web/src/features/assignments/ReviewQueue.tsx
web/src/pages/lk/LkLessonPage.tsx
web/src/pages/lk/LkAssignmentPage.tsx
```

---

### Task 1: Prisma — `StoredFile` + `Assignment.responseMode`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_stored_files_response_mode/migration.sql`

**Interfaces:**
- Produces: enums `StoredFileOwnerType`, `AssignmentResponseMode`; model `StoredFile`; field `Assignment.responseMode`

- [ ] **Step 1: Add enums and models to schema**

Add after existing enums:

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

Add model:

```prisma
model StoredFile {
  id           String              @id @default(cuid())
  ownerType    StoredFileOwnerType
  ownerId      String
  courseId     String
  uploadedById String
  originalName String
  mimeType     String
  sizeBytes    Int
  storageKey   String
  createdAt    DateTime            @default(now())

  course     Course @relation(fields: [courseId], references: [id], onDelete: Cascade)
  uploadedBy User   @relation(fields: [uploadedById], references: [id], onDelete: Cascade)

  @@index([ownerType, ownerId])
  @@index([courseId])
}
```

On `Assignment` add:

```prisma
responseMode AssignmentResponseMode @default(QUIZ)
```

Wire `StoredFile[]` / relations on `Course` and `User` (name relation `UploadedFiles` on User if needed).

- [ ] **Step 2: Create and apply migration**

Run:

```bash
npx prisma migrate dev --name stored_files_response_mode
npx prisma generate
```

Expected: migration applied; client regenerates with new types.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add StoredFile and Assignment.responseMode"
```

---

### Task 2: Storage helpers — file key + delete

**Files:**
- Modify: `src/storage/storage.service.ts`
- Test: `src/storage/storage.service.spec.ts` (create; unit-test key shape only if pure; otherwise skip and cover via e2e)

**Interfaces:**
- Produces:
  - `buildFileKey(courseId, ownerType, ownerId, filename): string`
  - `deleteObject(key: string): Promise<void>`

- [ ] **Step 1: Extend StorageService**

```typescript
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { StoredFileOwnerType } from '@prisma/client';

buildFileKey(
  courseId: string,
  ownerType: StoredFileOwnerType | string,
  ownerId: string,
  filename: string,
): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `courses/${courseId}/files/${ownerType}/${ownerId}/${randomUUID()}-${safe}`;
}

async deleteObject(key: string): Promise<void> {
  await this.client.send(
    new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
  );
}
```

- [ ] **Step 2: Smoke import**

Run: `npx tsc -p tsconfig.build.json --noEmit`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/storage/storage.service.ts
git commit -m "feat: S3 file key builder and deleteObject"
```

---

### Task 3: Files module API

**Files:**
- Create: `src/files/files.mime.ts`
- Create: `src/files/dto/upload-file.dto.ts`
- Create: `src/files/files.service.ts`
- Create: `src/files/files.controller.ts`
- Create: `src/files/files.module.ts`
- Modify: `src/app.module.ts`
- Create: `test/files.e2e-spec.ts`
- Create: `src/files/files.mime.spec.ts`

**Interfaces:**
- Consumes: `StorageService`, `CourseAccessService`, `PrismaService`
- Produces:
  - `POST /files` multipart fields `file`, `ownerType`, `ownerId`
  - `GET /files?ownerType=&ownerId=`
  - `GET /files/:id/download` → `{ url: string }`
  - `DELETE /files/:id`

- [ ] **Step 1: Mime helper + unit test**

`src/files/files.mime.ts`:

```typescript
export const PNG_PDF_MIMES = new Set(['image/png', 'application/pdf']);
export const MAX_PNG_PDF_BYTES = 20 * 1024 * 1024;

export function assertPngOrPdf(mime: string, size: number): void {
  if (!PNG_PDF_MIMES.has(mime)) {
    throw new Error('Only PNG and PDF are allowed');
  }
  if (size > MAX_PNG_PDF_BYTES) {
    throw new Error('File exceeds 20 MB limit');
  }
}
```

`src/files/files.mime.spec.ts`:

```typescript
import { assertPngOrPdf } from './files.mime';

describe('assertPngOrPdf', () => {
  it('accepts png under limit', () => {
    expect(() => assertPngOrPdf('image/png', 100)).not.toThrow();
  });
  it('rejects jpeg', () => {
    expect(() => assertPngOrPdf('image/jpeg', 100)).toThrow(/PNG and PDF/);
  });
  it('rejects oversize', () => {
    expect(() => assertPngOrPdf('application/pdf', 21 * 1024 * 1024)).toThrow(
      /20 MB/,
    );
  });
});
```

Run: `npx jest src/files/files.mime.spec.ts`  
Expected: PASS (after file exists)

- [ ] **Step 2: Implement FilesService ACL + CRUD**

Resolve `courseId` from owner:

- `LESSON_MATERIAL` → `lesson.module.courseId`
- `ASSIGNMENT_MATERIAL` → `assignment.courseId`
- `SUBMISSION_ATTACHMENT` → `submission.assignment.courseId`

Upload rules:

- materials: `canManageCourse`
- submission: actor is submission.userId, status `IN_PROGRESS`

List/download: manage OR content access (enrolled) for materials; submission owner OR manage for attachments.

Delete: manage for materials; submission owner + `IN_PROGRESS` OR manage.

Map mime errors to `BadRequestException`.

Return list items: `{ id, originalName, mimeType, sizeBytes, createdAt }` (never expose `storageKey` in list; download returns signed URL only).

- [ ] **Step 3: Controller**

```typescript
@Post('files')
@UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PNG_PDF_BYTES } }))
upload(
  @CurrentUser() user: AuthUser,
  @UploadedFile() file: Express.Multer.File,
  @Body() body: { ownerType: string; ownerId: string },
) { ... }

@Get('files')
list(@CurrentUser() user: AuthUser, @Query('ownerType') ownerType: string, @Query('ownerId') ownerId: string) { ... }

@Get('files/:id/download')
download(@CurrentUser() user: AuthUser, @Param('id') id: string) { ... }

@Delete('files/:id')
remove(@CurrentUser() user: AuthUser, @Param('id') id: string) { ... }
```

Register `FilesModule` in `AppModule`. Ensure multer uses memory storage (Nest default) so `file.buffer` exists — match lessons video upload.

- [ ] **Step 4: E2E**

In `test/files.e2e-spec.ts` (bootstrap like `homework.e2e-spec.ts`): staff creates course/module/lesson; uploads tiny PNG buffer; lists; downloads; student without enroll gets 403; after enroll can list/download; reject `image/jpeg`.

Run: `npx jest --config ./test/jest-e2e.json test/files.e2e-spec.ts`  
Expected: PASS (MinIO must be up via docker-compose).

- [ ] **Step 5: Commit**

```bash
git add src/files src/app.module.ts test/files.e2e-spec.ts
git commit -m "feat: files API for lesson/assignment/submission attachments"
```

---

### Task 4: Assignment `responseMode` + submit validation

**Files:**
- Modify: `src/assignments/dto/assignment.dto.ts`
- Modify: `src/assignments/assignments.service.ts`
- Modify: `src/submissions/submissions.service.ts`
- Modify: `test/homework.e2e-spec.ts`

**Interfaces:**
- Consumes: `StoredFile` count for `SUBMISSION_ATTACHMENT` + `ownerId = submissionId`
- Produces: create/update persist `responseMode`; submit enforces mode

- [ ] **Step 1: DTO + create/update**

Add to `CreateAssignmentDto` / `UpdateAssignmentDto`:

```typescript
@IsOptional()
@IsEnum(AssignmentResponseMode)
responseMode?: AssignmentResponseMode;
```

Persist in `assignments.service` create/update. For create with `FILE`, allow empty `questions` array. For `QUIZ` / `QUIZ_AND_FILE`, keep requiring ≥1 question (or match existing behavior).

- [ ] **Step 2: Submit validation**

At start of `submit()` after loading assignment:

```typescript
const fileCount = await this.prisma.storedFile.count({
  where: {
    ownerType: StoredFileOwnerType.SUBMISSION_ATTACHMENT,
    ownerId: submissionId,
  },
});

const mode = assignment.responseMode;
if (mode === AssignmentResponseMode.FILE || mode === AssignmentResponseMode.QUIZ_AND_FILE) {
  if (fileCount < 1) {
    throw new BadRequestException('At least one PNG/PDF attachment is required');
  }
}
```

For `FILE` with zero questions: skip quiz grading loop; treat like open-review path (`hasOpen = true` or dedicated branch so status goes to needs-review / SUBMITTED awaiting manual grade — mirror OPEN question flow).

For `QUIZ`: do not require files.

For `QUIZ_AND_FILE`: run existing quiz grading **and** require files; if any OPEN or FILE mode needs review, keep review path.

- [ ] **Step 3: E2E matrix**

Add cases:

1. `FILE` assignment, submit without file → 400  
2. `FILE` assignment, upload file then submit → 200  
3. `QUIZ` still works without files  

Run: `npx jest --config ./test/jest-e2e.json test/homework.e2e-spec.ts -t "FILE"`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/assignments src/submissions test/homework.e2e-spec.ts
git commit -m "feat: assignment responseMode and file submit rules"
```

---

### Task 5: Review payload includes submission files

**Files:**
- Modify: review list method in `src/submissions/submissions.service.ts` (or assignments review endpoint used by `ReviewQueue`)
- Modify: `web/src/features/assignments/ReviewQueue.tsx` (minimal: show names + download button calling `/files/:id/download`)

**Interfaces:**
- Produces: each review item includes `files: { id, originalName, mimeType }[]`

- [ ] **Step 1: Backend include**

When returning submissions for review, attach:

```typescript
files: await prisma.storedFile.findMany({
  where: { ownerType: 'SUBMISSION_ATTACHMENT', ownerId: submission.id },
  select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
})
```

- [ ] **Step 2: ReviewQueue UI**

For each submission, map files to links: `api(/files/${id}/download)` → open `url` in new tab.

- [ ] **Step 3: Manual smoke** (or e2e assert `files` array on review endpoint)

- [ ] **Step 4: Commit**

```bash
git add src/submissions web/src/features/assignments/ReviewQueue.tsx
git commit -m "feat: show submission files in review queue"
```

---

### Task 6: Calendar course colors

**Files:**
- Create: `web/src/shared/schedule/courseColor.ts`
- Modify: `web/src/features/schedule/WeekStripCalendar.tsx` (`EventChip`)
- Modify: `web/src/features/schedule/CalendarView.tsx` if it shows multi-course later; for single-course staff tab, keep type colors or still hash courseId from props

**Interfaces:**
- Produces: `courseColor(courseId: string): { bg: string; border: string; text: string }`

- [ ] **Step 1: Palette helper**

```typescript
const PALETTE = [
  { bg: '#f0e9ff', border: '#beaaf2', text: '#4a3a7a' },
  { bg: '#e8f4ff', border: '#94c8ff', text: '#1e4a7a' },
  { bg: '#e8f8ef', border: '#6bcf8e', text: '#1e5a35' },
  { bg: '#fff3e6', border: '#faad14', text: '#7a4e00' },
  { bg: '#ffe8ef', border: '#f759ab', text: '#7a1f45' },
  { bg: '#e6fffb', border: '#36cfc9', text: '#006d68' },
  { bg: '#f5f0e6', border: '#d4a373', text: '#5c4030' },
  { bg: '#eef0ff', border: '#8590ff', text: '#2a327a' },
];

export function courseColor(courseId: string) {
  let h = 0;
  for (let i = 0; i < courseId.length; i++) h = (h * 31 + courseId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
```

- [ ] **Step 2: EventChip**

If `event.course?.id` present, use `courseColor` for background/border. Keep LIVE vs DEADLINE via left-border style or small label (e.g. thicker border for LIVE, dashed for DEADLINE). Fix modal navigate to `/lk/lessons/${lessonId}`.

- [ ] **Step 3: Visual check** — day with 1 and with 3+ courses on `/lk` and `/lk/calendar`.

- [ ] **Step 4: Commit**

```bash
git add web/src/shared/schedule/courseColor.ts web/src/features/schedule
git commit -m "feat: color calendar events by course id"
```

---

### Task 7: Staff lesson edit — video + materials

**Files:**
- Create: `web/src/features/courses/LessonEditPanel.tsx`
- Create: `web/src/shared/files/FileUploadButton.tsx`
- Create: `web/src/shared/files/FileList.tsx`
- Modify: `web/src/features/courses/CourseWorkspace.tsx`

**Interfaces:**
- Consumes: `PATCH /lessons/:id`, `POST /lessons/:id/video/upload`, `PATCH /lessons/:id/video/external`, `POST /files`, `GET /files`, `DELETE /files/:id`

- [ ] **Step 1: Shared file UI**

`FileUploadButton`: `<input type="file" accept=".png,.pdf,image/png,application/pdf" />` → `FormData` with `file`, `ownerType`, `ownerId` → `POST /files` (use `fetch` with Bearer; do not JSON-encode).

`FileList`: query files, show name + delete.

- [ ] **Step 2: LessonEditPanel**

Fields: title, type (`VIDEO`|`TEXT`|`MIXED`), content textarea, isPublished, external video URL button, video file input → `POST /lessons/:id/video/upload`, materials `FileList` with `ownerType=LESSON_MATERIAL`.

Open panel from lesson row click / «Редактировать» in CourseWorkspace content tab.

- [ ] **Step 3: Manual smoke** — upload pdf + mp4/webm video; open as student on `LkLessonPage` after Task 9 (or playback API via network tab).

- [ ] **Step 4: Commit**

```bash
git add web/src/features/courses web/src/shared/files
git commit -m "feat: staff lesson video and materials upload UI"
```

---

### Task 8: Assignment constructor — mode + materials

**Files:**
- Modify: `web/src/features/assignments/AssignmentConstructor.tsx`

**Interfaces:**
- Consumes: `responseMode` on create/update; files API with `ASSIGNMENT_MATERIAL`

- [ ] **Step 1: UI**

Select: «Квиз» / «Только файл» / «Квиз + файл».  
When `FILE`, hide or collapse question builder; allow save with empty questions.  
After assignment exists (edit), show materials `FileList` for that assignment id.

- [ ] **Step 2: Payload includes `responseMode`**

- [ ] **Step 3: Commit**

```bash
git add web/src/features/assignments/AssignmentConstructor.tsx
git commit -m "feat: assignment responseMode and materials in constructor"
```

---

### Task 9: Student lesson materials + assignment file answers

**Files:**
- Modify: `web/src/pages/lk/LkLessonPage.tsx`
- Modify: `web/src/pages/lk/LkAssignmentPage.tsx`

**Interfaces:**
- Consumes: files API; assignment must expose `responseMode` from `GET` assignment detail (add to assignments get if missing)

- [ ] **Step 1: Ensure assignment GET returns `responseMode`**

If stripped, include field in assignments service get/list for students.

- [ ] **Step 2: LkLessonPage**

Load `GET /files?ownerType=LESSON_MATERIAL&ownerId=...`; show download buttons; keep playback.

- [ ] **Step 3: LkAssignmentPage**

- Load assignment materials (`ASSIGNMENT_MATERIAL`).  
- If mode `FILE` or `QUIZ_AND_FILE`: after `take` creates submission, allow upload with `ownerType=SUBMISSION_ATTACHMENT&ownerId=submissionId`; list/delete while `IN_PROGRESS`.  
- Hide quiz UI when mode `FILE`.  
- On submit error for missing file, show message.

- [ ] **Step 4: Smoke** — FILE homework end-to-end.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/lk src/assignments
git commit -m "feat: student lesson materials and file homework answers"
```

---

### Task 10: Verification sweep

**Files:** none new

- [ ] **Step 1: Backend**

```bash
npx jest --config ./test/jest-e2e.json test/files.e2e-spec.ts
npx jest --config ./test/jest-e2e.json test/homework.e2e-spec.ts
npx jest src/files/files.mime.spec.ts
```

Expected: all PASS

- [ ] **Step 2: Frontend**

```bash
cd web && npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 3: Manual checklist**

- [ ] Lesson materials on LIVE-linked lesson  
- [ ] Video playback enrolled  
- [ ] Calendar day with many courses → distinct colors  
- [ ] Review downloads student PDF  

- [ ] **Step 4: Final commit if fixes**

```bash
git commit -m "fix: files/calendar verification follow-ups"
```

---

## Spec coverage (self-review)

| Spec item | Task |
|-----------|------|
| StoredFile model | 1 |
| responseMode | 1, 4, 8 |
| Files API + ACL + 20MB PNG/PDF | 3 |
| Lesson video UI | 7 |
| Lesson materials | 3, 7, 9 |
| Assignment materials | 3, 8, 9 |
| Student answers + modes | 4, 9 |
| Review files | 5 |
| Calendar colors N courses/day | 6 |
| Deep-link `/lk/lessons/:id` | 6 |
| deleteObject / S3 keys | 2 |

No placeholders left; types aligned on `StoredFileOwnerType` and `AssignmentResponseMode`.
