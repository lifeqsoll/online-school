# Support Hub, Course Cancel & Staff Ratings — Design Spec

**Date:** 2026-08-03  
**Status:** Approved  
**UI constraint:** Match existing Ant Design + brand tokens; reuse `fadeUp` / `tabPanelVariants` / `easeOutExpo` from `web/src/shared/motion.ts` (same motion language as course workspace, support panel, notifications).

---

## Goals

1. Topic-based support tickets (curator COURSE / tech TECH) with attachments.
2. Course cancellation via curator chat → staff cancel button; refund **eligibility** if enrolled ≤ 5 days (no auto payout yet).
3. Optional post-close rating of curator / tech agent.
4. New `SUPPORT` global role with student tools (not full curator/admin).
5. Admin «Сотрудники» tab: roster + average rating + per-agent review list; admin sees all TECH chats.

---

## Current baseline

- Channels: `COURSE` (curators + admin) / `TECH` (admin only today).
- No topics, attachments, cancel, ratings, or `SUPPORT` role.
- XP only via assignment best attempt; radar from lesson engagement + HW.

---

## Topics

**COURSE (куратор)**  
`LESSON_QUESTION` · `HOMEWORK` · `SCHEDULE_LIVE` · `CONTENT_ACCESS` · `PROGRESS_XP` · `COURSE_CANCEL` · `OTHER`

**TECH**  
`AUTH_ACCOUNT` · `PAYMENT_ACCESS` · `SITE_BUG` · `MEDIA_FILES` · `NOTIFICATIONS_EMAIL` · `OTHER`

- UI: Select topic → subject prefilled; `OTHER` requires free-text subject.
- `COURSE_CANCEL` requires `courseId`; shows cancel CTA for curator of that course / admin after discussion.

---

## Attachments

- `StoredFileOwnerType.SUPPORT_MESSAGE`.
- Allow: images (png/jpeg/webp), video (mp4/webm), documents (pdf, common office) — reuse size limits pattern from files module.
- Upload after message create (or multipart later); max N files per message (e.g. 5).
- Author + staff on thread can read; closed thread: no new uploads.

---

## Course cancel & refund stub

**Who cancels:** curator of the course **or** admin (not SUPPORT).

**Effect:**
- `Enrollment.status` → `SUSPENDED` (access lost; history kept).
- Audit/event row optional: `EnrollmentCancellation` or fields on enrollment:
  - `cancelledAt`, `cancelledById`, `cancelThreadId?`, `cancelReason?`
  - `refundEligible` (bool): `now - enrollment.createdAt <= 5 days`
  - `refundStatus`: `NONE | ELIGIBLE | PENDING | PAID | DECLINED` (default `NONE`; set `ELIGIBLE` when cancelled in window)
- API: `POST /enrollments/:id/cancel` or `POST /courses/:courseId/enrollments/:userId/cancel` with optional `threadId`.
- **No** provider refund call in v1 — service method `RefundsService.requestOrMarkEligible(...)` stub for future YooKassa/manual.

---

## Ratings (optional)

- On thread `CLOSED`, student sees optional Rate 1–5 + short comment (skip allowed).
- `SupportRating`: `threadId` unique, `raterId`, `agentId` (staff who closed or last staff sender), `channel`, `score`, `comment?`, `createdAt`.
- Aggregate for Employees tab: avg + count per agent userId.

---

## Role `SUPPORT`

- `GlobalRole.SUPPORT` added alongside `STUDENT` | `ADMIN`.
- Shell `/support`: TECH inbox, student lookup card, tools.
- **Can:** view user/courses/payments (read), lesson grant, mark engagement/attendance, manual XP adjust (ledger reason `SUPPORT_ADJUST`), **module radar bonus** (new ledger/table), password-reset link trigger.
- **Cannot:** edit course content/HW, assign curators, cancel enrollment, admin users CRUD.

**Radar bonus:** `RadarBonus` (userId, courseId, moduleId, pointsDelta, reason, createdById) folded into `analytics.radarFor` axis score.

---

## Admin

- TECH inbox: all threads (already admin); show assigned/last agent.
- Sidebar **Сотрудники** (`/admin/staff`): email, name, role label (Admin / Support / Curator), avg rating; click → drawer/page of ratings for that person.
- Curators appear if they have COURSE ratings; SUPPORT + admins who handled TECH.

---

## UI / UX

- Extend `SupportPanel` create flow: channel → topic → course (if needed) → body + uploads.
- Cancel button on COURSE_CANCEL threads (staff).
- After close: rating card with framer-motion `fadeUp`.
- Support shell / Employees: same StaffShell patterns, tab motion `tabPanelVariants`.
- No new visual language (no purple glow / cream-serif drift); follow existing purple accent `#6b4fb8` and layout density.

---

## Delivery phases

| Phase | Scope |
|-------|--------|
| **A** | Topics + attachments + close + optional rating |
| **B** | Cancel enrollment + refund eligibility stub + cancel CTA in thread |
| **C** | `SUPPORT` role, shell, student tools (XP, grant, engagement, attendance, radar bonus, reset link) |
| **D** | Admin Employees tab + agent attribution on TECH chats |

---

## Out of scope (v1)

- Automatic money refund to payment provider.
- Student-initiated hard delete of enrollment.
- SUPPORT acting as course curator on content.
