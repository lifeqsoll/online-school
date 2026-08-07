# Bugfix batch — Calendar, HW tests, Lesson ends — Implementation Plan

> **Goal:** Fix home/course calendar visibility, lesson-linked HW on calendar, CHOICE option delete + single/multi, default points, grading student name, text overflow/OPEN max length, lesson end time.

**Date:** 2026-08-06

## File map

| Area | Files |
|------|--------|
| Schema | `prisma/schema.prisma` — `Question.allowMultiple`, `Question.maxAnswerLength`, `Lesson.endsAt` |
| Calendar FE | `LkHomePage.tsx`, `LkCoursePage.tsx`, `WeekStripCalendar.tsx`, `LkCalendarPage.tsx` |
| Calendar BE | `lessons.service.ts` sync endsAt; `assignments.service.ts` DEADLINE sync |
| Constructor | `AssignmentConstructor.tsx` |
| Student HW | `LkAssignmentPage.tsx` |
| Grading | `submissions.service.ts`, `ReviewQueue.tsx` |
| Lesson UI | `LessonEditPanel.tsx`, `lesson.dto.ts` |
| Grading logic | `auto-grade.ts` (multi stays; single enforce one key) |

## Tasks

### T1 — Schema
- `Question.allowMultiple Boolean @default(false)` — false = один ответ (Radio), true = несколько (Checkbox)
- `Question.maxAnswerLength Int?` — for OPEN; default 500 in app logic
- `Lesson.endsAt DateTime?` — optional end; sync to CourseEvent
- `db push` + `generate`

### T2 — CHOICE: delete options + single/multi
- Constructor: delete option button (≥2 remain); fix option id generation
- Toggle «Несколько ответов» → `allowMultiple`
- Student: Radio vs Checkbox.Group
- Persist `allowMultiple` in assignment DTO/service

### T3 — Calendar home/course + upcoming
- Confirm Home week `onRangeChange` works; fix upcoming empty-state loading flag; widen upcoming to 7 days if needed
- `LkCoursePage`: same week-range pattern as Home
- Backfill: on lesson list/save ensure LIVE CourseEvent exists when `scheduledAt` set
- `MonthGridCalendar` `onRangeChange` on `LkCalendarPage`

### T4 — Lesson-linked HW → calendar
- On assignment create/update/delete: upsert/delete `CourseEvent` DEADLINE
- If `lessonId` set: `startsAt = dueAt ?? lesson.scheduledAt` (skip if neither)
- Set `assignmentId` + `lessonId` on event

### T5 — Default points
- CHOICE=1, SHORT=3, OPEN=5 in constructor create/reset/initial

### T6 — Review student name
- `listCourse` include decrypted displayName
- `ReviewQueue` show name in table + modal title

### T7 — Overflow + OPEN max length
- Constrain list/prompt/answer CSS (`minWidth: 0`, ellipsis, max-width)
- OPEN: curator `maxAnswerLength` default 500; FE maxLength + BE validate

### T8 — Lesson endsAt picker
- `LessonEditPanel`: end DatePicker like start
- DTO + `syncCalendarEvent` use `endsAt` (fallback +1h)

## Verification
- [ ] Delete middle option in CHOICE; save; reload
- [ ] Single vs multi on student page
- [ ] Home: prev week + current week show dated lessons; upcoming list filled
- [ ] Lesson HW appears as DEADLINE on lesson day
- [ ] New questions get default points 1/3/5
- [ ] Review queue shows student name
- [ ] Long prompt truncated; OPEN capped at 500 (or curator value)
- [ ] Lesson end time saved on LIVE event
