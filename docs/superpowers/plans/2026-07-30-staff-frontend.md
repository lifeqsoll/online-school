# Staff Frontend (Admin + Curator) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build React staff UI in `web/` with separate `/admin` and `/curator` shells, Ant Design + Tailwind, wired to the existing Nest API — including a full homework constructor (CHOICE/SHORT/OPEN) and analytics (radar + React Flow).

**Architecture:** Vite SPA talks to Nest on `:3000`. Shared `features/*` modules parameterized by `scope: 'mine' | 'all'`. Dual layouts under `pages/admin` and `pages/curator`. Auth via JWT in localStorage + refresh.

**Tech Stack:** React 19, TypeScript, Vite, Ant Design 5, Tailwind 4 (or 3), React Router 7, TanStack Query, Recharts, React Flow, axios/fetch wrapper.

**Spec:** `docs/superpowers/specs/2026-07-30-staff-frontend-design.md`

## Global Constraints

- Product name in UI: «Олимпиадная школа» only — never third-party school names; no EGE/OGE copy.
- Accent `#beaaf2`, secondary `#94c8ff`, radius 8px, Inter for staff UI.
- Separate panels `/admin` and `/curator` (not one `/staff`).
- Homework constructor must support CHOICE, SHORT, and OPEN (curator review queue).
- Use existing Nest endpoints; fix CORS to allow `http://localhost:5173`.
- Backend remains source of truth; no mock-only business logic in UI beyond loading states.
- Commit after each task on `feature/foundation-auth` (or `feature/staff-frontend` if branched).

---

## File structure

```
web/                          # new Vite app
  package.json
  vite.config.ts              # proxy /api → :3000 optional
  src/app, shared, features, pages
src/main.ts / .env.example    # CORS_ORIGIN include 5173
docs/... (done)
```

---

### Task 1: Scaffold `web/` + theme + CORS

**Files:**
- Create: `web/` via `npm create vite@latest web -- --template react-ts`
- Install: `antd`, `@ant-design/icons`, `react-router-dom`, `@tanstack/react-query`, `axios`, `recharts`, `@xyflow/react`, `tailwindcss`, `dayjs`
- Modify: Nest `.env.example` + user `.env` note: `CORS_ORIGIN=http://localhost:5173` (or comma-list if supported — if single origin only, set 5173 for FE dev and keep public UI on API separately)
- If Nest only accepts one origin: prefer `http://localhost:5173` for FE work; test HTML stubs still same-origin on :3000 so CORS irrelevant for them.

**Interfaces:**
- Produces runnable `web` on `:5173` with Ant ConfigProvider theme tokens from spec
- `shared/theme/tokens.ts`, `shared/api/client.ts` (attach Bearer)

- [ ] **Step 1: Scaffold + install deps**

- [ ] **Step 2: Tailwind + Ant theme provider + empty App shell**

- [ ] **Step 3: CORS** — set `CORS_ORIGIN=http://localhost:5173` in `.env.example`; document in README snippet

- [ ] **Step 4: Commit**

```bash
git add web .env.example
git commit -m "feat: scaffold staff web app with Ant Design and Tailwind"
```

---

### Task 2: Auth + dual shells (admin/curator layouts)

**Files:**
- `web/src/features/auth/*` — login page, token storage, `/auth/login` `/auth/refresh` `/users/me`
- `web/src/pages/admin/AdminLayout.tsx`, `web/src/pages/curator/CuratorLayout.tsx`
- Router with guards

**Interfaces:**
- Produces: login → redirect by role; sidebar menus per spec §4; impersonation banner placeholder
- Detect curator: `globalRole===ADMIN` → admin; else if user has course memberships as curator (may need `GET /me/enrollments` + memberships — if API lacks “my curator courses”, use course list filter or add thin `GET /me/courses/managed` later; v1: admin-only login for admin panel; for curator use memberships from course detail or seed curator)

**Backend gap check:** If no endpoint lists courses where user is curator, add `GET /me/managed-courses` in Nest (small Task 2b). Prefer: list all courses user can manage via existing list (curator sees managed+published).

- [ ] **Step 1: Login + me + route guards**

- [ ] **Step 2: AdminLayout + CuratorLayout sidebars**

- [ ] **Step 3: Manual smoke login as admin**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add staff login and admin/curator shell layouts"
```

---

### Task 3: Courses + lessons workspace

**Files:**
- `features/courses/*`, lesson editors calling existing course/module/lesson/video APIs

**Interfaces:**
- Course table (scope mine/all), course tabs: Modules/Lessons, price/publish
- External video + upload if feasible (FormData to existing upload endpoint)

- [ ] **Step 1: Course list + create**

- [ ] **Step 2: Module/lesson CRUD UI**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add staff course and lesson management UI"
```

---

### Task 4: Homework constructor + review queue

**Files:**
- `features/assignments/AssignmentConstructor.tsx` — left list / center editor / summary
- Question editors: ChoiceEditor, ShortEditor, OpenEditor
- `features/assignments/ReviewQueue.tsx`

**Interfaces:**
- Create assignment with scope LESSON|MODULE|COURSE
- PUT questions until submissions exist; disable edit after
- Review: list PENDING_REVIEW → grade OPEN points + feedback
- Wire to `/courses/:id/assignments`, `/assignments/:id/questions`, `/submissions/:id/grade`

- [ ] **Step 1: Constructor UI for CHOICE + SHORT + OPEN**

- [ ] **Step 2: Publish + preview (hide keys)**

- [ ] **Step 3: Review queue + grade**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add homework constructor and curator review queue UI"
```

---

### Task 5: Students, grant, impersonation

**Files:**
- `features/students/*`, `features/impersonation/*`

**Interfaces:**
- Enrolled table, grant modal, student drawer (XP + radar), start/stop impersonate via existing impersonation API; banner when `imp` claims present

- [ ] **Step 1–3: Implement + commit**

```bash
git commit -m "feat: add students panel and impersonation controls"
```

---

### Task 6: Analytics + XP leaderboard

**Files:**
- `features/analytics/RadarPanel.tsx`, `ColdLessons.tsx`, `StrugglingTopics.tsx`, `KnowledgeGraph.tsx` (React Flow)
- `features/xp/Leaderboard.tsx`
- Topics tag UI on lessons/assignments (PUT topics)

**Interfaces:**
- Call analytics endpoints; course select by scope

- [ ] **Step 1–3: Implement + commit**

```bash
git commit -m "feat: add staff analytics radar, graph, and XP leaderboard"
```

---

### Task 7: Admin users + assign curators

**Files:**
- `features/users/*`, course tab «Кураторы»

**Interfaces:**
- Admin user list; assign curator to course (existing admin/membership endpoint — verify path in Nest `AssignCuratorDto` / courses service)

- [ ] **Step 1: Verify backend assign-curator route; add if missing**

- [ ] **Step 2: UI + commit**

```bash
git commit -m "feat: add admin user list and curator assignment UI"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Dual /admin /curator | 2 |
| Theme tokens | 1 |
| Courses/lessons | 3 |
| HW constructor CHOICE/SHORT/OPEN | 4 |
| Review queue | 4 |
| Students + impersonate | 5 |
| Radar + graph + XP | 6 |
| Assign curators | 7 |
| Olympiad naming | all copy |
| CORS | 1 |

## Manual test script

1. `docker compose up -d` + Nest `start:dev` + `cd web && npm run dev`  
2. Login admin → create course/lesson → constructor with CHOICE+OPEN → publish  
3. Register student (API or later) enroll + submit → admin review OPEN → XP  
4. Analytics radar after topic tags + low score  
5. Assign second user as curator → login curator → see only managed course  
