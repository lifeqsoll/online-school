# Staff Frontend: Admin & Curator Panels — Design Spec

**Date:** 2026-07-30  
**Status:** Draft for user review  
**Scope:** React staff UI for **Admin** and **Curator** panels (not student cabinet, not marketing landing).  
**Backend:** Existing NestJS API (`online-school` root).  
**Brand:** «Олимпиадная школа» (olympiad prep — not EGE/OGE; do not use third-party school names from reference kits).

---

## 1. Goals

- Deliver two staff shells: `/admin` and `/curator`, sharing design tokens and feature modules.
- Admin can do everything a curator can **plus** manage all courses, users, curator assignment, global course analytics.
- Wire UI to backend: courses/lessons/video, enrollments/grants, assignments/submissions/grading, XP/leaderboard, topics/engagement analytics (radar, cold lessons, struggling, graph).
- Ship a **full homework constructor**: auto-graded test questions + open answers queued for curator review.

### Out of scope (this slice)

- Student learning cabinet / public landing
- Flashcards / spaced repetition from external LMS PDF (later)
- Real YooKassa checkout UI
- Dark theme
- Email verification UX

---

## 2. Locked decisions

| Topic | Choice |
|-------|--------|
| App location | `web/` Vite + React + TypeScript in same repo |
| UI kit | Ant Design 5 + Tailwind CSS (tokens) |
| Charts | Recharts (radar «роза ветров», bars) |
| Graph | React Flow |
| Icons | Ant Design Icons / SVG |
| Panels | Separate routes `/admin/*` and `/curator/*` (shared components) |
| Visual mood | Brand-kit palette (lavender accent `#beaaf2`, secondary `#94c8ff`, light surfaces) without third-party naming |
| Product name | «Олимпиадная школа» |
| Auth | JWT access + refresh against Nest; role-based redirect after login |
| API base | `VITE_API_URL` → `http://localhost:3000` |

---

## 3. Architecture

```
web/
  src/
    app/              # router, providers (Ant ConfigProvider, QueryClient)
    shared/           # api client, auth store, theme tokens, layout primitives
    features/
      auth/
      courses/        # list, course workspace tabs
      lessons/
      assignments/    # constructor + review queue
      students/
      analytics/      # radar, cold, struggling, flow graph
      xp/
      users/          # admin-only
      impersonation/
    pages/
      admin/          # admin shell + pages
      curator/        # curator shell + pages
```

- **Data:** TanStack Query (or equivalent) over fetch/axios wrapper with Bearer token.
- **Auth guard:** routes check `globalRole` / course membership; curator cannot open `/admin`.
- **Shared feature modules** receive `scope: 'mine' | 'all'`.

### CORS

Nest `CORS_ORIGIN` must include Vite origin (`http://localhost:5173`).

---

## 4. Information architecture

### Login `/login`

Redirect: `ADMIN` → `/admin`; user with curator membership → `/curator`; else message that student UI is not ready (or stub link).

### Curator sidebar

1. Обзор  
2. Мои курсы  
3. Домашние задания  
4. Ученики  
5. Аналитика  
6. XP / лидерборд  
7. Профиль  

### Admin sidebar

1. Обзор  
2. Все курсы  
3. Домашние задания  
4. Ученики / записи  
5. Аналитика  
6. XP / лидерборд  
7. Пользователи  
8. Назначение кураторов (also embedded on course tab)  
9. Профиль  

### Header (both)

Search (page-scoped), notifications stub, profile menu, **Impersonate** entry (policy as backend: admin any; curator enrolled student on own courses), stop-impersonation banner when active.

---

## 5. Visual tokens

```text
--bg: #ffffff
--surface: #f5f5f5
--fg: #000000
--muted: #8c8c8c
--border: #dbdbdb
--accent: #beaaf2
--accent-soft: #f7f0ff
--accent-hover: #e6dbff
--accent-2: #94c8ff
--radius: 8px
font: Inter (UI)
```

Ant `ConfigProvider` theme maps `colorPrimary` to accent. Role badge: Admin vs Curator.

Copy voice: olympiad training, problem-solving, topics/skills — never EGE/OGE exam cram messaging.

---

## 6. Key screens

### Dashboard

Stats: courses count, pending reviews, active enrollments, optional XP sum. Quick actions.

### Courses

Table → course workspace tabs:

| Tab | Curator | Admin |
|-----|---------|-------|
| Модули / Уроки | yes | yes |
| ДЗ | yes | yes |
| Ученики | yes | yes |
| Аналитика | yes | yes |
| Кураторы | no | yes |
| Цена / publish | yes | yes |

Lesson editor: text/video/mixed; external URL or upload to MinIO via existing API.

### Students

Enrolled table, grant enroll, open student drawer: XP, radar `/analytics/radar/:userId`, Impersonate.

### Analytics

- Radar (Recharts) — per student; struggling flags  
- Cold lessons table + bar chart  
- Struggling topics  
- React Flow graph from `/analytics/graph`  

Course selector: curator = own courses; admin = any.

### XP / leaderboard

Course leaderboard table + link from impersonation context.

### Admin: Users & curators

User list from admin API. Assign curator: select user → attach `CourseMembership CURATOR` (existing backend endpoint).

---

## 7. Homework constructor (detailed)

Goal: curator/admin builds rich assignments without leaving the panel. Maps 1:1 to backend `Assignment` + `Question` types.

### Assignment shell

- Scope: **Урок** | **Модуль** | **Курс** (промежуточные контрольные)  
- Fields: title, description, `maxXp`, `maxAttempts` (null = unlimited), `dueAt` (optional display), `isPublished`, topic tags  
- After first student submission: questions locked for edit (backend Conflict) — UI disables editor and suggests “duplicate assignment” later (v1: disable only)

### Question types in constructor

1. **Тест — один/несколько вариантов (CHOICE)**  
   - Prompt, options list (add/remove/reorder), mark correct key(s), points  
   - Auto-graded on submit  

2. **Тест — короткий ответ (SHORT)**  
   - Prompt, acceptable answers, match `EXACT` or `NUMBER` + tolerance, points  
   - Auto-graded  

3. **Развёрнутый ответ (OPEN)**  
   - Prompt, max points, optional grading hint for curator  
   - **No auto-grade** → submission `PENDING_REVIEW` → appears in review queue  

Mixed assignments allowed (e.g. 3 CHOICE + 1 OPEN): XP applied only when fully graded (backend rule).

### Constructor UX

- Left: question list (drag reorder)  
- Center: selected question editor  
- Right/summary: total points, estimated XP mapping (`scoreXp = round(maxXp * earned/total)`)  
- Preview mode: student-facing (hides correct keys)  
- Actions: Save draft, Publish, Open review queue for this course  

### Review queue

- Filters: course, status `PENDING_REVIEW`  
- Open submission: show auto scores + OPEN text; curator sets `pointsAwarded` + feedback; submit grade  

---

## 8. API mapping (existing)

Uses Foundation/Catalog/Homework/Analytics routes already implemented. No new backend required for v1 staff UI except ensuring CORS and any small DTO gaps discovered during build (fix in Nest if needed).

---

## 9. Non-functional

- Staff pages load under ~2s on local API with warm cache where practical  
- Forms validated client-side + server errors surfaced via Ant message/notification  
- Sanitize already on API; still avoid rendering unsanitized HTML in previews  

---

## 10. Delivery order (implementation hint)

1. Vite scaffold + theme + auth + dual shells  
2. Courses + lessons  
3. **Homework constructor + review queue**  
4. Students + impersonation  
5. Analytics (radar + graph) + XP  
6. Admin users + curator assignment  

---

## 11. Success criteria

- Curator can create published LESSON quiz (CHOICE+SHORT), student submits via API/stub, XP visible in panel  
- Curator can create OPEN question, see pending queue, grade, see XP update  
- Admin can assign curator to course and open any course analytics including radar  
- No third-party school naming; olympiad framing throughout UI copy  
