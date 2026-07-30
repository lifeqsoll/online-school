# Student Public Site & LK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship guest landing + catalog, enroll/buy with deferred auth, student LK (calendar + courses + lessons), and staff course calendar CRUD on the existing Nest + `web/` stack.

**Architecture:** Extend Nest with optional-auth public course reads and a `schedule` module (`CourseEvent`). Extend the same Vite app with `PublicShell`, `StudentShell`, and staff calendar tab. Reuse enrollments, mock payments, lesson playback, assignments list.

**Tech Stack:** NestJS 11, Prisma 7, React 19, Vite, Ant Design 5, Tailwind, React Router, TanStack Query, dayjs.

**Spec:** `docs/superpowers/specs/2026-07-31-student-public-design.md`

## Global Constraints

- Product name in UI: «Олимпиадная школа» only — never third-party school names; no EGE/OGE copy.
- Accent `#beaaf2`, secondary `#94c8ff`, radius 8px, light theme.
- No shopping cart, пробники, база знаний, renewal banner in this slice.
- Purchase = direct CTA on course (free enroll / mock paid).
- Calendar events: `LIVE` | `DEADLINE` only.
- `GET /me/calendar` = events for **enrolled** courses only; staff course tab = course-scoped CRUD.
- Commit after each task on `feature/foundation-auth`.

---

## File structure

```
prisma/schema.prisma                          # CourseEvent + enum + Course.events
prisma/migrations/..._course_events/
src/rbac/guards/jwt-auth.guard.ts             # optional JWT on @Public()
src/courses/courses.controller.ts             # @Public list/get; Optional user
src/courses/courses.service.ts                # guest list; safe public get
src/schedule/                                 # new module
  schedule.module.ts
  schedule.controller.ts
  schedule.service.ts
  dto/course-event.dto.ts
src/app.module.ts                             # import ScheduleModule
test/schedule.e2e-spec.ts
test/catalog.e2e-spec.ts                      # guest list/get assertions
web/src/App.tsx                               # public + /lk routes
web/src/shared/auth/AuthContext.tsx           # register(); postLoginPath helper
web/src/shared/auth/postLoginPath.ts          # ADMIN→/admin, curator→/curator, else /lk
web/src/shared/layout/PublicShell.tsx
web/src/shared/layout/StudentShell.tsx
web/src/shared/layout/StaffShell.tsx          # link «Кабинет ученика»
web/src/features/auth/AuthModal.tsx
web/src/features/catalog/EnrollBuyButton.tsx
web/src/features/schedule/CalendarView.tsx
web/src/features/schedule/CourseCalendarTab.tsx
web/src/pages/public/LandingPage.tsx
web/src/pages/public/CatalogPage.tsx
web/src/pages/public/PublicCoursePage.tsx
web/src/pages/lk/LkHomePage.tsx
web/src/pages/lk/LkCalendarPage.tsx
web/src/pages/lk/LkCoursePage.tsx
web/src/pages/lk/LkLessonPage.tsx
web/src/pages/LoginPage.tsx                   # student → /lk; keep staff redirects
```

---

### Task 1: Public catalog API (optional JWT + safe get)

**Files:**
- Modify: `src/rbac/guards/jwt-auth.guard.ts`
- Modify: `src/courses/courses.controller.ts`
- Modify: `src/courses/courses.service.ts` (`list`, `get` → `getForViewer`)
- Modify: `test/catalog.e2e-spec.ts`

**Interfaces:**
- Consumes: existing `CoursesService.list(user?, opts?)`
- Produces: `@Public() GET /courses` and `@Public() GET /courses/:idOrSlug` with optional Bearer; guests see published only; unpublished detail → 404 for guests

- [ ] **Step 1: Write failing e2e for guest list**

Append to `test/catalog.e2e-spec.ts`:

```typescript
it('guest can list published courses without auth', async () => {
  const res = await request(app.getHttpServer()).get('/courses').expect(200);
  expect(Array.isArray(res.body)).toBe(true);
  for (const c of res.body) {
    expect(c.isPublished).toBe(true);
  }
});

it('guest can get published course detail', async () => {
  await request(app.getHttpServer()).get(`/courses/${courseId}`).expect(200);
});
```

(Use a published `courseId` from existing setup; if setup requires admin first, keep order after publish.)

- [ ] **Step 2: Run e2e — expect FAIL (401 on GET /courses)**

Run: `npx jest --config ./test/jest-e2e.json test/catalog.e2e-spec.ts -t "guest can list"`
Expected: FAIL with 401 Unauthorized

- [ ] **Step 3: Optional JWT on public routes**

In `jwt-auth.guard.ts`:

```typescript
canActivate(context: ExecutionContext) {
  const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
  if (isPublic) {
    return (super.canActivate(context) as Promise<boolean>).catch(() => true);
  }
  return super.canActivate(context);
}

handleRequest<TUser>(err: Error | null, user: TUser): TUser {
  if (err || !user) {
    return undefined as TUser;
  }
  return user;
}
```

Note: `handleRequest` must not throw on public missing user. If base class throws, override carefully:

```typescript
handleRequest(err: Error | null, user: unknown, _info: unknown, context: ExecutionContext) {
  const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
  if (isPublic) {
    if (err || !user) return undefined;
    return user;
  }
  if (err || !user) throw err || new UnauthorizedException();
  return user;
}
```

- [ ] **Step 4: Mark list/get public; pass optional user**

```typescript
@Public()
@Get()
list(
  @CurrentUser() user: AuthUser | undefined,
  @Query('managedOnly') managedOnly?: string,
) {
  return this.courses.list(user, {
    managedOnly: managedOnly === '1' || managedOnly === 'true',
  });
}

@Public()
@Get(':idOrSlug')
get(
  @CurrentUser() user: AuthUser | undefined,
  @Param('idOrSlug') idOrSlug: string,
) {
  return this.courses.getForViewer(user, idOrSlug);
}
```

Implement `getForViewer`:

```typescript
async getForViewer(user: AuthUser | undefined, idOrSlug: string) {
  const course = await this.get(idOrSlug); // existing include modules/lessons
  if (course.isPublished) {
    if (!user || !(await this.access.canManageCourse(user, course.id))) {
      return {
        ...course,
        modules: course.modules.map((m) => ({
          id: m.id,
          title: m.title,
          sortOrder: m.sortOrder,
          lessons: m.lessons
            .filter((l) => l.isPublished)
            .map((l) => ({
              id: l.id,
              title: l.title,
              type: l.type,
              sortOrder: l.sortOrder,
              isPublished: l.isPublished,
            })),
        })),
      };
    }
  } else {
    if (!user || !(await this.access.canManageCourse(user, course.id))) {
      throw new NotFoundException('Course not found');
    }
  }
  return course;
}
```

For guests on published courses, strip `content` / `videoUrl` / `storageKey` from lessons (titles only) — map as above.

When `managedOnly` and `!user`, return `[]`.

- [ ] **Step 5: Re-run e2e — PASS**

Run: `npx jest --config ./test/jest-e2e.json test/catalog.e2e-spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/rbac/guards/jwt-auth.guard.ts src/courses/courses.controller.ts src/courses/courses.service.ts test/catalog.e2e-spec.ts
git commit -m "feat: public published course list and safe course detail"
```

---

### Task 2: Schedule module (`CourseEvent`) + e2e

**Files:**
- Modify: `prisma/schema.prisma` — add enum, model, `Course.events CourseEvent[]`, optional `Lesson.events`, `Assignment.events`
- Create migration via `npx prisma migrate dev --name course_events`
- Create: `src/schedule/dto/course-event.dto.ts`
- Create: `src/schedule/schedule.service.ts`
- Create: `src/schedule/schedule.controller.ts`
- Create: `src/schedule/schedule.module.ts`
- Modify: `src/app.module.ts`
- Create: `test/schedule.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `GET /courses/:courseId/events?from=&to=`
  - `POST /courses/:courseId/events`
  - `PATCH /events/:id`
  - `DELETE /events/:id`
  - `GET /me/calendar?from=&to=`
- DTO create:

```typescript
export class CreateCourseEventDto {
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsEnum(CourseEventType) type!: 'LIVE' | 'DEADLINE';
  @IsISO8601() startsAt!: string;
  @IsOptional() @IsISO8601() endsAt?: string;
  @IsOptional() @IsUrl() meetingUrl?: string;
  @IsOptional() @IsString() lessonId?: string;
  @IsOptional() @IsString() assignmentId?: string;
}
```

- [ ] **Step 1: Prisma model**

```prisma
enum CourseEventType {
  LIVE
  DEADLINE
}

model CourseEvent {
  id           String          @id @default(cuid())
  courseId     String
  title        String
  description  String?
  type         CourseEventType
  startsAt     DateTime
  endsAt       DateTime?
  meetingUrl   String?
  lessonId     String?
  assignmentId String?
  createdById  String
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt

  course     Course      @relation(fields: [courseId], references: [id], onDelete: Cascade)
  lesson     Lesson?     @relation(fields: [lessonId], references: [id], onDelete: SetNull)
  assignment Assignment? @relation(fields: [assignmentId], references: [id], onDelete: SetNull)
  createdBy  User        @relation(fields: [createdById], references: [id], onDelete: Restrict)

  @@index([courseId, startsAt])
  @@index([startsAt])
}
```

Add reverse relations on `Course`, `Lesson`, `Assignment`, `User`.

Run: `npx prisma migrate dev --name course_events`

- [ ] **Step 2: Failing e2e**

```typescript
describe('Schedule (e2e)', () => {
  // login admin, create published course, enroll student
  it('curator/admin creates LIVE event; student sees it on /me/calendar', async () => {
    const created = await request(app.getHttpServer())
      .post(`/courses/${courseId}/events`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Лекция 1',
        type: 'LIVE',
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        endsAt: new Date(Date.now() + 90000000).toISOString(),
        meetingUrl: 'https://meet.example.com/x',
      })
      .expect(201);

    const from = new Date(Date.now() - 86400000).toISOString();
    const to = new Date(Date.now() + 7 * 86400000).toISOString();
    const cal = await request(app.getHttpServer())
      .get(`/me/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(cal.body.some((e: { id: string }) => e.id === created.body.id)).toBe(true);
  });

  it('student cannot create events', async () => {
    await request(app.getHttpServer())
      .post(`/courses/${courseId}/events`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        title: 'Nope',
        type: 'DEADLINE',
        startsAt: new Date().toISOString(),
      })
      .expect(403);
  });
});
```

- [ ] **Step 3: Run — FAIL (404)**

Run: `npx jest --config ./test/jest-e2e.json test/schedule.e2e-spec.ts`
Expected: FAIL Cannot POST /courses/.../events

- [ ] **Step 4: Implement ScheduleService**

```typescript
async listCourseEvents(actor: AuthUser, courseId: string, from: Date, to: Date) {
  const ok =
    (await this.access.canManageCourse(actor, courseId)) ||
    (await this.access.hasContentAccess(actor, courseId));
  if (!ok) throw new ForbiddenException();
  return this.prisma.courseEvent.findMany({
    where: { courseId, startsAt: { gte: from, lte: to } },
    orderBy: { startsAt: 'asc' },
  });
}

async create(actor: AuthUser, courseId: string, dto: CreateCourseEventDto) {
  if (!(await this.access.canManageCourse(actor, courseId))) {
    throw new ForbiddenException();
  }
  // validate lessonId/assignmentId belong to courseId if present
  return this.prisma.courseEvent.create({
    data: {
      courseId,
      title: dto.title,
      description: dto.description,
      type: dto.type,
      startsAt: new Date(dto.startsAt),
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      meetingUrl: dto.type === 'LIVE' ? dto.meetingUrl : null,
      lessonId: dto.lessonId,
      assignmentId: dto.assignmentId,
      createdById: actor.realUserId,
    },
  });
}

async calendarMine(actor: AuthUser, from: Date, to: Date) {
  const enrollments = await this.prisma.enrollment.findMany({
    where: { userId: actor.id, status: 'ACTIVE' },
    select: { courseId: true },
  });
  const courseIds = enrollments.map((e) => e.courseId);
  if (!courseIds.length) return [];
  return this.prisma.courseEvent.findMany({
    where: {
      courseId: { in: courseIds },
      startsAt: { gte: from, lte: to },
    },
    orderBy: { startsAt: 'asc' },
    include: { course: { select: { id: true, title: true } } },
  });
}
```

Mirror `update` / `remove` with `canManageCourse` on the event’s course.

Controller routes (avoid clash with `courses/:idOrSlug`): put event collection under courses; patch/delete under `events`:

```typescript
@Controller()
export class ScheduleController {
  @Get('courses/:courseId/events')
  list(...) {}

  @Post('courses/:courseId/events')
  create(...) {}

  @Patch('events/:id')
  update(...) {}

  @Delete('events/:id')
  remove(...) {}

  @Get('me/calendar')
  mine(@CurrentUser() user: AuthUser, @Query('from') from: string, @Query('to') to: string) {
    return this.schedule.calendarMine(user, new Date(from), new Date(to));
  }
}
```

Register `ScheduleModule` in `AppModule`.

- [ ] **Step 5: e2e PASS + commit**

```bash
git add prisma src/schedule src/app.module.ts test/schedule.e2e-spec.ts
git commit -m "feat: add course calendar events and /me/calendar API"
```

---

### Task 3: Auth helpers — register, redirects, staff → LK link

**Files:**
- Create: `web/src/shared/auth/postLoginPath.ts`
- Modify: `web/src/shared/auth/AuthContext.tsx` — add `register`
- Modify: `web/src/pages/LoginPage.tsx`
- Modify: `web/src/shared/layout/StaffShell.tsx`

**Interfaces:**
- Produces:

```typescript
export async function resolvePostLoginPath(
  user: AuthUser,
  apiGet: <T>(path: string) => Promise<T>,
): Promise<string> {
  if (user.globalRole === 'ADMIN') return '/admin';
  const managed = await apiGet<unknown[]>('/courses?managedOnly=true');
  if (managed.length) return '/curator';
  return '/lk';
}
```

```typescript
// AuthContext
register(email: string, password: string, firstName?: string): Promise<AuthUser>
```

- [ ] **Step 1: Implement `postLoginPath.ts` + `register` in AuthContext**

Register calls `POST /auth/register` with `{ email, password, firstName }`, stores tokens like login.

- [ ] **Step 2: LoginPage uses `resolvePostLoginPath`**

Replace hard curator-block with: after login, `nav(await resolvePostLoginPath(user, api))`. Students without curator courses go to `/lk`. Keep Russian error toasts.

- [ ] **Step 3: StaffShell header**

Add button/link next to logout:

```tsx
<Button type="link" onClick={() => nav('/lk')}>Кабинет ученика</Button>
```

- [ ] **Step 4: Manual smoke** — login admin → `/admin`, click «Кабинет ученика» → `/lk`

- [ ] **Step 5: Commit**

```bash
git add web/src/shared/auth web/src/pages/LoginPage.tsx web/src/shared/layout/StaffShell.tsx
git commit -m "feat: student post-login path and staff link to LK"
```

---

### Task 4: PublicShell + Landing + Catalog + Course + AuthModal enroll/buy

**Files:**
- Create: `web/src/shared/layout/PublicShell.tsx`
- Create: `web/src/pages/public/LandingPage.tsx`
- Create: `web/src/pages/public/CatalogPage.tsx`
- Create: `web/src/pages/public/PublicCoursePage.tsx`
- Create: `web/src/features/auth/AuthModal.tsx`
- Create: `web/src/features/catalog/EnrollBuyButton.tsx`
- Modify: `web/src/App.tsx` — routes `/`, `/catalog`, `/courses/:idOrSlug`; default `*` → `/` (not only `/login`)

**Interfaces:**
- `AuthModalProps`: `{ open, onClose, onSuccess: () => void }` — tabs login/register
- `EnrollBuyButton`: `{ courseId, priceCents, enrolled?: boolean }`

- [ ] **Step 1: PublicShell**

Header: brand «Олимпиадная школа», links Каталог, Войти (or «Кабинет» if authed). Soft lavender/sky background tokens. Outlet for children.

- [ ] **Step 2: LandingPage**

Hero: brand as hero signal, one headline (олимпиадная подготовка), one sentence, CTAs → `/catalog` and `/login`. Second section short «О платформе». No third-party names. Full-bleed soft gradient atmosphere (not purple-on-white AI cliché — use brand lavender/sky on light surface).

- [ ] **Step 3: CatalogPage**

```tsx
const q = useQuery({
  queryKey: ['courses', 'public'],
  queryFn: () => api<Course[]>('/courses', { auth: false }),
});
const [freeOnly, setFreeOnly] = useState(false);
const rows = (q.data ?? []).filter((c) => !freeOnly || c.priceCents === 0);
```

List cards → link `/courses/${id}`. Checkbox «Только бесплатные».

Use `auth: false` so guest works even if stale token exists; if logged in and want managed view, catalog still shows published (OK).

- [ ] **Step 4: AuthModal + EnrollBuyButton**

```tsx
async function ensureAuth(): Promise<boolean> {
  if (user) return true;
  setModalOpen(true);
  return false; // onSuccess will retry
}

async function doEnrollOrBuy() {
  if (priceCents === 0) {
    await api(`/courses/${courseId}/enroll`, { method: 'POST' });
  } else {
    const { payment } = await api<{ payment: { id: string } }>(
      `/courses/${courseId}/checkout`,
      { method: 'POST' },
    );
    await api('/payments/mock/confirm', {
      method: 'POST',
      json: { paymentId: payment.id },
    });
  }
  message.success('Вы записаны на курс');
  nav(`/lk/courses/${courseId}`);
}
```

If already enrolled (`GET /me/enrollments` includes course) → button «Перейти в кабинет».

- [ ] **Step 5: PublicCoursePage** — load `GET /courses/:id` with `auth: false` (or with auth if present for enrolled check), show modules titles, wire EnrollBuyButton.

- [ ] **Step 6: Wire App routes under PublicShell**

```tsx
<Route element={<PublicShell />}>
  <Route path="/" element={<LandingPage />} />
  <Route path="/catalog" element={<CatalogPage />} />
  <Route path="/courses/:idOrSlug" element={<PublicCoursePage />} />
</Route>
```

Keep `/login`, `/admin`, `/curator`, add `/lk` placeholder Navigate until Task 5.

- [ ] **Step 7: Manual smoke** — open `http://localhost:5173/` logged out → catalog → course → register in modal → land in LK (or temporary /login until Task 5)

- [ ] **Step 8: Commit**

```bash
git add web/src/shared/layout/PublicShell.tsx web/src/pages/public web/src/features/auth web/src/features/catalog web/src/App.tsx
git commit -m "feat: public landing, catalog, and enroll/buy with auth modal"
```

---

### Task 5: StudentShell + LK home + calendar pages

**Files:**
- Create: `web/src/shared/layout/StudentShell.tsx`
- Create: `web/src/features/schedule/CalendarView.tsx`
- Create: `web/src/pages/lk/LkHomePage.tsx`
- Create: `web/src/pages/lk/LkCalendarPage.tsx`
- Modify: `web/src/App.tsx` — `/lk` guard + routes

**Interfaces:**
- `CalendarViewProps`: `{ events: Array<{ id, title, type, startsAt, endsAt?, meetingUrl?, lessonId?, assignmentId?, course?: { id, title } }>; mode: 'week' | 'month'; onEventClick?: (e) => void }`
- `GET /me/calendar?from=&to=` ISO range for visible week/month

- [ ] **Step 1: StudentShell**

Curtain sider (`collapsedWidth={0}`) like StaffShell: icons Home (`/lk`), Calendar (`/lk/calendar`), Courses (scroll or `/lk` courses list), Logout. Header: name; if admin → link `/admin`; else if managed courses → `/curator`; link to `/catalog`.

- [ ] **Step 2: CalendarView**

Use Ant Design `Calendar` or a simple week grid with dayjs. Color LIVE vs DEADLINE (sky vs lavender). Click opens Modal with title, time, meeting link, navigate to lesson if `lessonId`.

- [ ] **Step 3: LkHomePage**

```tsx
const from = startOfWeek; const to = endOfWeek;
const cal = useQuery({
  queryKey: ['me-calendar', from, to],
  queryFn: () => api(`/me/calendar?from=${from}&to=${to}`),
});
const enrollments = useQuery({
  queryKey: ['me-enrollments'],
  queryFn: () => api('/me/enrollments'),
});
```

Render CalendarView + list of enrolled courses linking to `/lk/courses/:id`.

- [ ] **Step 4: LkCalendarPage** — same data, week/month toggle.

- [ ] **Step 5: Guard**

```tsx
function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spin fullscreen />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
```

- [ ] **Step 6: Smoke** — enrolled student sees events created in Task 2

- [ ] **Step 7: Commit**

```bash
git add web/src/shared/layout/StudentShell.tsx web/src/features/schedule/CalendarView.tsx web/src/pages/lk web/src/App.tsx
git commit -m "feat: student LK shell with home and calendar"
```

---

### Task 6: LK course + lesson pages

**Files:**
- Create: `web/src/pages/lk/LkCoursePage.tsx`
- Create: `web/src/pages/lk/LkLessonPage.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Course: `GET /courses/:id` (auth) + `GET /courses/:courseId/assignments`
- Lesson: `GET /lessons/:id/playback`

- [ ] **Step 1: LkCoursePage**

Tabs: Уроки | ДЗ. Modules → lesson links to `/lk/lessons/:id`. Assignments list (published only from API).

- [ ] **Step 2: LkLessonPage**

```tsx
const pb = useQuery({
  queryKey: ['playback', lessonId],
  queryFn: () => api(`/lessons/${lessonId}/playback`),
});
```

Render text `content`; if video URL present, `<video src=... controls />` or iframe for external. On 403 show toast «Нет доступа к уроку».

- [ ] **Step 3: Routes**

```tsx
<Route path="/lk" element={<AuthGuard><StudentShell /></AuthGuard>}>
  <Route index element={<LkHomePage />} />
  <Route path="calendar" element={<LkCalendarPage />} />
  <Route path="courses/:courseId" element={<LkCoursePage />} />
  <Route path="lessons/:lessonId" element={<LkLessonPage />} />
</Route>
```

- [ ] **Step 4: Smoke** — free enroll → open lesson playback

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/lk/LkCoursePage.tsx web/src/pages/lk/LkLessonPage.tsx web/src/App.tsx
git commit -m "feat: student course and lesson pages in LK"
```

---

### Task 7: Staff CourseWorkspace calendar tab

**Files:**
- Create: `web/src/features/schedule/CourseCalendarTab.tsx`
- Modify: `web/src/features/courses/CourseWorkspace.tsx` — add tab `calendar`

**Interfaces:**
- Uses `GET/POST /courses/:courseId/events`, `PATCH/DELETE /events/:id`
- Form fields: type, title, startsAt, endsAt, meetingUrl (if LIVE), optional lessonId / assignmentId Select from course modules / assignments query

- [ ] **Step 1: CourseCalendarTab**

List events in range + «Создать» Modal. On submit POST; edit/delete for existing.

- [ ] **Step 2: Add tab to CourseWorkspace**

```tsx
{
  key: 'calendar',
  label: 'Календарь',
  children: <CourseCalendarTab courseId={courseId} modules={course.data.modules} />,
}
```

Support `?tab=calendar` via existing searchParams.

- [ ] **Step 3: Smoke** — curator creates DEADLINE linked to assignment; student sees on `/lk`

- [ ] **Step 4: Commit**

```bash
git add web/src/features/schedule/CourseCalendarTab.tsx web/src/features/courses/CourseWorkspace.tsx
git commit -m "feat: staff course calendar tab for LIVE and DEADLINE events"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| Public landing `/` | 4 |
| Catalog + free-only checkbox | 4 |
| Course detail + enroll/buy + auth modal | 4 |
| Public course API | 1 |
| Mock paid path | 4 |
| LK shell curtain | 5 |
| LK home calendar + my courses | 5 |
| LK calendar page | 5 |
| LK course + lesson | 6 |
| CourseEvent LIVE/DEADLINE API | 2 |
| Staff calendar tab | 7 |
| Staff → LK link | 3 |
| Login redirect student → `/lk` | 3 |
| Backlog items excluded | Global Constraints |

No TBD placeholders. Types aligned: `CourseEventType`, `CreateCourseEventDto`, `resolvePostLoginPath`, `CalendarView` event shape.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-31-student-public.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
