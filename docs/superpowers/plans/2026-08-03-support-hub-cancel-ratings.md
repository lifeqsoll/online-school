# Support Hub, Course Cancel & Staff Ratings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Topic-based support with attachments, optional agent ratings, course cancel + refund eligibility stub, `SUPPORT` role toolkit, and admin «Сотрудники» ratings view — UI/motion consistent with the current app.

**Architecture:** Extend existing Nest `support` + `files` + `enrollments` + `xp`/`analytics` modules and React `SupportPanel` / StaffShell. Add `GlobalRole.SUPPORT`, thread `topic` + ratings + enrollment cancel fields; no live payout provider in v1.

**Tech Stack:** NestJS 11, Prisma 7, React 19, Vite, Ant Design 5, TanStack Query, Framer Motion (`web/src/shared/motion.ts`).

**Spec:** `docs/superpowers/specs/2026-08-03-support-hub-cancel-ratings-design.md`

## Global Constraints

- UI/UX must match current staff/student shells; reuse `fadeUp`, `tabPanelVariants`, `easeOutExpo`.
- Cancel: curator of course **or** admin only; SUPPORT cannot cancel.
- Refund: if cancel within 5 days of `enrollment.createdAt` → `refundStatus=ELIGIBLE`; **no** auto provider refund.
- Ratings: optional after thread close (student can skip).
- Do not commit unless user asks.

---

## File map

| Area | Create / touch |
|------|----------------|
| Schema | `prisma/schema.prisma` — enums, SupportThread fields, SupportRating, RadarBonus, Enrollment cancel/refund fields, StoredFileOwnerType |
| Support API | `src/support/*` |
| Files | `src/files/files.service.ts`, mime helpers |
| Enrollments | `src/enrollments/*` — cancel endpoint |
| Refund stub | `src/payments/refunds.service.ts` (new stub) |
| XP / radar | `src/xp/*`, `src/analytics/analytics.service.ts` |
| Auth/RBAC | `src/rbac/*`, `src/auth/*`, Guard for SUPPORT |
| FE support | `web/src/features/support/SupportPanel.tsx`, Lk support pages |
| FE support shell | `web/src/App.tsx`, new `SupportShell` / pages |
| FE admin staff | `web/src/pages/staff/StaffEmployeesPage.tsx`, `StaffShell.tsx` menus |

---

## Phase A — Topics, attachments, ratings

### Task A1: Schema — topics, attachments owner, ratings

**Files:** `prisma/schema.prisma`

- [ ] Add `SupportTopic` enum (COURSE + TECH codes from spec).
- [ ] `SupportThread`: `topic SupportTopic`, optional `assigneeId` / track last staff via messages.
- [ ] `StoredFileOwnerType.SUPPORT_MESSAGE`.
- [ ] `SupportRating` model (`threadId` unique, `raterId`, `agentId`, `score` 1–5, `comment?`).
- [ ] `npx prisma db push` && `npx prisma generate`.

### Task A2: Backend — create thread with topic + list/present topic

**Files:** `src/support/dto/support.dto.ts`, `support.service.ts`, `support.controller.ts`

- [ ] DTO: required `topic`; validate channel↔topic; `OTHER` needs subject; `COURSE_CANCEL` needs courseId.
- [ ] Persist topic; return in thread DTOs.
- [ ] Smoke: create COURSE + TECH threads with topics.

### Task A3: Backend — message attachments

**Files:** `src/files/files.service.ts`, `files.mime.ts`, `support.service.ts`

- [ ] Resolve `SUPPORT_MESSAGE` owner → thread → courseId nullable (use thread.courseId or a platform sentinel / first linked course — prefer `courseId` optional on StoredFile only if schema allows; else require TECH threads to use a dedicated “platform” course or make `courseId` optional on StoredFile for this owner — **prefer** keep `courseId` required: for TECH use a config `PLATFORM_COURSE_ID` **or** store attachments with `courseId` from enrollment if any, else create nullable courseId migration for StoredFile).
- [ ] **Decision locked in plan:** add `courseId String?` on `StoredFile` **or** always set `courseId` from thread.courseId and for TECH without course use the user’s first ACTIVE enrollment courseId if present, else reject upload with “укажите курс” — simpler: **make `StoredFile.courseId` optional** for SUPPORT_MESSAGE only via schema `courseId String?` (breaking: change to optional globally with null for support-tech).
- [ ] assertCanUpload/Read/Delete for thread participants + staff.
- [ ] Present attachments on messages in `GET /support/threads/:id`.

### Task A4: Frontend — topic select + uploads in SupportPanel

**Files:** `web/src/features/support/SupportPanel.tsx`, motion imports

- [ ] Create form: topic Select (options by channel) + conditional course + body.
- [ ] After send message / create: Upload attachments bound to message id.
- [ ] Animate new message list / create modal with existing motion helpers.
- [ ] Manual check: student creates curator ticket with topic + photo.

### Task A5: Backend + FE — optional rating on close

**Files:** `support.service.ts`, `SupportPanel.tsx`

- [ ] On close, resolve `agentId` = closer if staff, else last staff message sender.
- [ ] `POST /support/threads/:id/rating` { score, comment? } — only author, thread CLOSED, once.
- [ ] `GET` eligibility for rating on thread detail.
- [ ] FE: after close (or when opening closed thread), optional Rate + comment + Skip; `fadeUp` card.

---

## Phase B — Course cancel + refund stub

### Task B1: Schema — enrollment cancel / refund fields

**Files:** `prisma/schema.prisma`

- [ ] Enum `RefundStatus`: `NONE | ELIGIBLE | PENDING | PAID | DECLINED`.
- [ ] Enrollment: `cancelledAt`, `cancelledById`, `cancelThreadId`, `cancelReason`, `refundStatus` default `NONE`.
- [ ] db push + generate.

### Task B2: RefundsService stub + cancel enrollment API

**Files:** `src/payments/refunds.service.ts`, `enrollments.service.ts`, controller

- [ ] `markEligibleIfWithinDays(enrollment, days=5)` sets `ELIGIBLE` else leaves `NONE`.
- [ ] `cancelEnrollment(actor, courseId, userId, { threadId?, reason? })`: auth curator/admin; set `SUSPENDED` + cancel fields; call markEligible.
- [ ] Stub `processRefund(enrollmentId)` throws `NotImplemented` or returns `{ ok: false, reason: 'not_implemented' }`.
- [ ] Test: enroll → cancel within window → `refundStatus=ELIGIBLE`; access denied for content.

### Task B3: Cancel CTA on COURSE_CANCEL threads

**Files:** `support.service.ts`, `SupportPanel.tsx`

- [ ] Staff (canManageCourse) sees «Отменить курс» when topic is `COURSE_CANCEL` and enrollment ACTIVE.
- [ ] Confirm modal → call cancel API → message in thread system line or success toast.
- [ ] Show refund eligibility hint in UI («возврат возможен» / «вне окна 5 дней»).

---

## Phase C — SUPPORT role + toolkit

### Task C1: GlobalRole.SUPPORT + auth/guards

**Files:** `schema.prisma`, `auth.service.ts`, `rbac`, `web` AuthContext + Guard

- [ ] Add `SUPPORT` to `GlobalRole`.
- [ ] Login/me returns role; Guard `role="SUPPORT"`; admin can still open `/support`.
- [ ] Seed or admin-users: allow setting role to SUPPORT.

### Task C2: Support shell + TECH inbox

**Files:** `web/src/App.tsx`, new layout under `web/src/pages/support/`, `StaffShell` variant or SupportShell

- [ ] Routes `/support`, `/support/inbox`, `/support/users/:id`.
- [ ] Inbox = TECH threads (SUPPORT + ADMIN).
- [ ] Motion: outlet / tab panels like staff.

### Task C3: Student card APIs for SUPPORT

**Files:** new `src/support/support-ops.service.ts` or `src/users/support-ops*`

- [ ] `GET /support/users/:id` — profile summary, enrollments, payments (masked as needed), recent threads.
- [ ] Authorize SUPPORT or ADMIN only.

### Task C4: Tools — XP adjust, grant, engagement, attendance, password reset link

**Files:** `xp.service.ts` (+ `XpReason.SUPPORT_ADJUST`), `lessons.service.ts`, `engagement.service.ts`, `auth` forgot-password reuse, FE student card actions

- [ ] `POST /support/users/:id/courses/:courseId/xp` { delta, reason }.
- [ ] Reuse grant + attendance + engagement endpoints with SUPPORT allowed via access service helpers.
- [ ] `POST /support/users/:id/password-reset` triggers existing forgot-password mail for that email.
- [ ] FE action buttons with confirm + toast.

### Task C5: Radar bonus

**Files:** schema `RadarBonus`, `analytics.service.ts`, support-ops API + FE

- [ ] Model + `POST /support/users/:id/courses/:courseId/radar-bonus` { moduleId, delta, reason }.
- [ ] Fold bonuses into `radarFor` axis values.
- [ ] FE: pick module + delta.

---

## Phase D — Admin Employees + chat attribution

### Task D1: Ratings aggregation API

**Files:** `src/support/support-ratings.service.ts` (or extend support.service)

- [ ] `GET /admin/staff/ratings` — list agents with avg, count, role labels.
- [ ] `GET /admin/staff/:userId/ratings` — list SupportRating rows with thread subject/date.

### Task D2: Admin «Сотрудники» page

**Files:** `StaffShell.tsx` adminMenu, `StaffEmployeesPage.tsx`, `App.tsx`

- [ ] Menu item «Сотрудники».
- [ ] Table: email, name, role, avg rating; click rating → drawer with reviews.
- [ ] Use `fadeUp` on page enter.

### Task D3: TECH chat agent visibility

**Files:** `support.service.ts` inbox/detail presenters, SupportPanel inbox UI

- [ ] Show last staff responder / assignee on TECH threads for admin.
- [ ] Ensure closed threads show linked rating if any.

---

## Verification checklist (end-to-end)

- [ ] Student: create COURSE topic + attach file; curator replies; close; skip or leave rating.
- [ ] Student: COURSE_CANCEL → curator cancels → enrollment SUSPENDED; refund ELIGIBLE if ≤5 days.
- [ ] SUPPORT user: open TECH inbox, open student card, grant lesson, adjust XP, add radar bonus.
- [ ] Admin: Employees tab shows averages; drill into reviews; sees all TECH chats.
- [ ] UI motions present on new panels; no layout regression on existing SupportPanel.

---

## Notes for implementers

- Prefer extending `SupportPanel` over rewriting chat UX.
- After every Prisma schema change: `db push` + `prisma generate` or Nest watch will fail with missing client fields.
- Keep Russian copy consistent with existing toasts («На проверке», «Отправлено», etc.).
