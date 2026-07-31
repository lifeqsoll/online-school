# Lesson icons & completion — Design Spec

**Date:** 2026-08-01  
**Status:** Approved (approach A)  
**Scope:** Lesson type icons; auto-complete rules; curator grant/revoke completion.

## Goals

- Show distinct icons for LIVE / recorded VIDEO / TEXT in student (and knowledge) lists.
- Auto-mark lesson completed: VIDEO ≥80% watched; TEXT and LIVE ≥2 minutes on page (tab visible).
- Curators/admins can grant or revoke completion per student or for all enrolled students on a lesson.

## Rules

| Kind | Detection | Auto-complete |
|------|-----------|---------------|
| LIVE | `scheduledAt` set (and/or meeting) | 2 min active on lesson page |
| VIDEO | `type === VIDEO` and not LIVE | `progressPct >= 80` |
| TEXT | `type === TEXT` (even if scheduled — treat as LIVE if `scheduledAt`) | 2 min if LIVE else 2 min for TEXT |

**LIVE wins:** if `scheduledAt` is set, use LIVE rules and icon regardless of `type`.

## Data

Extend `LessonEngagement`:

- `completedBy` enum: `AUTO` | `CURATOR` | null (when not completed)
- `completedByUserId` optional (curator who set/cleared last grant)
- Clearing completion: `completedAt = null`, `completedBy = null`; keep `viewedAt` / `maxProgressPct`
- Curator can **grant and revoke** per student or for all enrollees (buttons «Отметить всех» / «Снять у всех», switch per row).

API threshold: COMPLETE accepts `progressPct >= 80` (was 90). Analytics “done” for wind rose: `completedAt != null` **or** `maxProgressPct >= 80` (align from 75).

## API

- `POST /lessons/:id/engagement` — existing; student VIEW/COMPLETE/SKIP; COMPLETE ≥80.
- `GET /courses/:courseId/lessons/:lessonId/attendance` — enrolled students + engagement status (staff).
- `POST /courses/:courseId/lessons/:lessonId/attendance` — `{ userIds?: string[], all?: true, completed: boolean }` — grant or revoke.

## UI

- Shared `lessonTypeIcon(lesson)` helper.
- `LkLessonPage`: ping VIEW on open; video progress; 2 min timer for text/LIVE (pause when `document.hidden`).
- Course workspace tab **«Выполненные уроки»**: pick lesson → checklist of students → toggle one / «Отметить всех» / «Снять у всех».

## Out of scope

- XP for lesson completion (unless already wired elsewhere).
- Changing LessonType enum to add LIVE (derive from `scheduledAt`).
