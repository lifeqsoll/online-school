# Student Cabinet & Public Site — Design Spec

**Date:** 2026-07-31  
**Status:** Draft for user review  
**Scope:** Public landing + catalog (guest browse), enroll/buy with deferred auth, student personal cabinet (LK), course calendar (LIVE + DEADLINE) for students and staff.  
**App:** Same Vite React app in `web/` alongside `/admin` and `/curator`.  
**Backend:** NestJS + Prisma extensions for `CourseEvent`; reuse enrollments, payments (mock), lessons.  
**Brand:** «Олимпиадная школа» (olympiad prep — not EGE/OGE; do not use third-party school names from reference kits).

---

## 1. Goals

- Let guests **browse** the site and published courses **without** logging in.
- At **enroll / buy**, require login or registration, then continue the same action.
- Deliver a **student LK** with calendar-first home, my courses, lesson playback, published homework list.
- Let **admin and course curators** manage schedule events on a course calendar tab.
- Keep staff panels; add a link **«Кабинет ученика»** so staff can open `/lk` in student mode.

### Explicit later backlog (not this slice)

- Shopping cart («В корзину»)
- Mock exams / «пробники»
- Knowledge base («база знаний»)
- Course renewal orange banner («Пора продлить курс»)
- Catalog filters by exam / subject / duration (beyond «only free»)
- Real YooKassa UI (keep mock confirm)
- Cat mascot / full marketing parity with reference screenshots
- Separate student-only Vite app

---

## 2. Locked decisions

| Topic | Choice |
|-------|--------|
| Slice shape | Option **C**: landing + catalog + direct buy + simple LK |
| Purchase | Option **A**: no cart — CTA on course card |
| Calendar content | Option **C**: `LIVE` sessions + `DEADLINE` items in one calendar |
| App location | Option **A**: extend existing `web/` |
| Staff → student | After login staff land on `/admin` or `/curator`; header link to `/lk` |
| Public catalog API | Published courses list/detail readable **without** auth |
| Free filter | Checkbox «Только бесплатные» on catalog |
| Visual tokens | Lavender `#beaaf2`, sky `#94c8ff`, light surfaces (align with staff UI) |
| Auth at purchase | Modal: login **or** register, then resume enroll/checkout |
| Payments | Existing mock checkout + mock confirm |

---

## 3. Routes (frontend)

| Zone | Paths | Access |
|------|-------|--------|
| Public | `/`, `/catalog`, `/courses/:idOrSlug` | Anyone |
| Auth | `/login` (unified); purchase modal reuses same API | Guests |
| Student LK | `/lk`, `/lk/calendar`, `/lk/courses/:courseId`, `/lk/lessons/:lessonId` | Authenticated |
| Staff | `/admin/*`, `/curator/*` (existing) + course tab **Календарь** | Admin / curator |

Default post-login redirect:

- `ADMIN` → `/admin`
- User with curator memberships → `/curator`
- Otherwise → `/lk`

Guards:

- `/lk/*` requires any authenticated user (student or staff).
- Lesson/content APIs still enforce enrollment / manage access as today.

---

## 4. Architecture

```
web/src/
  pages/public/          # LandingPage, CatalogPage, PublicCoursePage
  pages/lk/              # LkHome, LkCalendar, LkCourse, LkLesson
  shared/layout/         # PublicShell, StudentShell (curtain sider)
  features/catalog/      # list, filters (freeOnly), enroll CTA
  features/schedule/     # calendar grid, event form (staff), event detail
  features/auth/         # AuthModal for purchase resume
  ... existing staff features unchanged
```

Backend:

```
src/schedule/   # CourseEvent CRUD + GET /me/calendar
```

Prisma:

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
  startsAt     DateTime        // LIVE start or DEADLINE due
  endsAt       DateTime?       // LIVE end optional
  meetingUrl   String?         // LIVE only
  lessonId     String?
  assignmentId String?
  createdById  String
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  course       Course          @relation(...)
  // optional FKs to Lesson, Assignment, User
}
```

---

## 5. Public site

### Landing `/`

- Brand-first hero: «Олимпиадная школа», one headline, one short sentence, CTAs: **Каталог** / **Войти**.
- Short «about» section (one job).
- No third-party naming; no inset card collage hero.

### Catalog `/catalog`

- List published courses from `GET /courses` (public).
- Show title, short description, price (or «Бесплатно»), CTA to detail.
- Checkbox **«Только бесплатные»** (`priceCents === 0` client filter; optional `?freeOnly=true` later).

### Course detail `/courses/:idOrSlug`

- Title, description, price, module titles (no unpaid lesson bodies).
- CTA:
  - free → «Записаться бесплатно»
  - paid → «Купить»
- If already enrolled → «Перейти в кабинет».

### Purchase / enroll flow

1. Guest clicks CTA → open **AuthModal** (login | register).
2. On success, continue:
   - free → `POST /courses/:id/enroll`
   - paid → `POST /courses/:id/checkout` then mock `POST /payments/mock/confirm` in dev UI
3. Redirect to `/lk/courses/:id`.

Errors: Russian toasts (wrong password, conflict already enrolled, paid requires checkout, etc.).

---

## 6. Student LK

### Shell

- Collapsible curtain sider (icons: home/calendar, courses, logout).
- Header: display name; XP snippet optional when a course context exists; if `ADMIN` or has curator memberships → link to staff panel; always can open public catalog.

### Screens (this slice)

| Screen | Content |
|--------|---------|
| `/lk` | Week calendar (all enrollments) + short «мои курсы» list |
| `/lk/calendar` | Week/month toggle, same event source |
| `/lk/courses/:id` | Modules → lessons; tabs Уроки / ДЗ (published assignments) |
| `/lk/lessons/:id` | Text / video playback via existing lesson API |

Click LIVE → show meeting URL if present; click DEADLINE / linked lesson or assignment → navigate when ids present.

---

## 7. Calendar API & staff UI

### Permissions

| Action | Guest | Enrolled student | Course curator | Admin |
|--------|-------|------------------|----------------|-------|
| List published courses | yes | yes | yes | yes |
| CRUD events on course | no | no | own courses | yes |
| `GET /me/calendar` | no | yes (enrolled courses) | yes (as user) | yes |

Curators/admins also see events for managed courses when viewing staff calendar tab (course-scoped), independent of their personal enrollment.

### Endpoints

- `GET /courses/:courseId/events?from=&to=` — manage access (curator/admin) or enrolled student
- `POST /courses/:courseId/events` — curator/admin
- `PATCH /events/:id`, `DELETE /events/:id` — curator/admin for that course
- `GET /me/calendar?from=&to=` — aggregate for actor’s enrollments (and optionally managed courses for staff convenience — **locked:** enrollments only for LK; staff course tab uses course-scoped list)

### Staff UI

- New tab **Календарь** in `CourseWorkspace` (admin + curator).
- Create/edit modal: type, title, startsAt/endsAt, meetingUrl (LIVE), optional lessonId / assignmentId pickers from course tree.

---

## 8. Backend changes beyond schedule

- Restore **public** read for published courses: unauthenticated `GET /courses` returns only `isPublished: true`; authenticated admin sees all; `managedOnly=true` still returns curator-managed set.
- Public `GET /courses/:idOrSlug` returns safe detail for published courses (no draft leakage).
- Existing enroll/checkout/lesson access rules unchanged.

---

## 9. Testing / acceptance

- Guest opens `/` → `/catalog` → course detail without token.
- Free enroll with register-in-modal lands in `/lk`.
- Paid mock path creates enrollment after confirm.
- Student sees LIVE + DEADLINE on `/lk` calendar after curator creates events.
- Curator cannot edit another course’s events; admin can.
- Staff login still opens staff panel; «Кабинет ученика» opens `/lk`.
- «Только бесплатные» hides paid rows.

---

## 10. Out of scope (repeat)

Cart, пробники, база знаний, renewal banner, exam/subject filters, real YooKassa, mascot marketing kit, separate student app — tracked for follow-up slices after this MVP ships.
