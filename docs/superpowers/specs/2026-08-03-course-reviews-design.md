# Course reviews — Design Spec

**Date:** 2026-08-03  
**Status:** Approved (A + weekly auto reminder + edit/delete/photos)

## Rules

- Author: ACTIVE enrollment. Photos attach in the same submit flow.
- One review per user+course.
- First submit → `PENDING` until staff approves → then visible in catalog (`publishedRating` / published photos).
- **Edit of already published review** applies immediately to catalog (rating/text/photos); no stale duplicate.
- Edit of unpublished/rejected → stays/resubmits as `PENDING`.
- Delete → immediate hard delete of review + all photos.
- Auto reminder: enrolled ≥3 days, no PENDING/APPROVED (or published) review, at most **once per 7 days**.
- Manual «Попросить отзыв»: all ACTIVE without review (no 3-day / weekly gate).
- Moderation: admin all; curator own. Sidebar «Отзывы» + toast (`notifyCourseReviews`).

## Data

`CourseReview` (+ `publishedRating`, `publishedBody`), `StoredFile.isPublished` / `pendingDelete` for review photos, notification kinds `REVIEW_REQUEST` / `REVIEW_PENDING`.
