# Catalog: Courses, Lessons, Enrollments & Payments Foundation — Design Spec

**Date:** 2026-07-30  
**Status:** Draft for user review  
**Scope:** Backend Catalog slice on top of Foundation. No production React app. Test via HTML console + Postman/cURL.  
**Depends on:** `docs/superpowers/specs/2026-07-30-foundation-auth-design.md`

---

## 1. Goals

Build the course catalog and access layer for the olympiad online school:

- Course hierarchy: **Course → Module → Lesson** (`VIDEO` | `TEXT` | `MIXED`)
- Curator manages own courses; admin manages all
- Student joins via **free enroll**, **paid checkout** (mock now), or **grant**
- Video: **uploaded to object storage (MinIO/S3)** and/or **external playable URL** (not a bare link)
- Activate **curator → enrolled student** impersonation
- Lay payment foundations for **YooKassa later** without integrating the real SDK in this slice

### Out of scope

- Real YooKassa SDK / production merchant credentials
- CDN / video transcoding
- Homework, XP, Neo4j analytics
- Production React admin/student UI (only extend test HTML)

---

## 2. Locked decisions

| Topic | Choice |
|-------|--------|
| Architecture | Extend modular NestJS monolith |
| Content tree | Course → Module → Lesson; lesson types VIDEO / TEXT / MIXED |
| Enrollment | Hybrid: free self-enroll, paid path, admin/curator grant |
| Paid access | Only after successful payment (mock confirm now) |
| Free courses | `priceCents === 0` |
| Payments provider now | `MockPaymentProvider`; `PAYMENT_PROVIDER=mock` |
| Payments later | Same interface → YooKassa; webhook route reserved |
| Video storage | MinIO in Docker Compose (S3 API); prod → any S3-compatible |
| External video | Allowed if playable (direct mp4 / YouTube / Vimeo embed metadata) |
| Deploy assumption | Single VPS initially for API + DB + Redis + MinIO + static |

---

## 3. NestJS modules

```
src/
  courses/       # course CRUD, publish, pricing, assign curator
  course-modules/# modules under a course (Nest name avoids clash with Module)
  lessons/       # lessons + video attach
  enrollments/   # free enroll, grant, me/enrollments, access helpers
  payments/      # Payment entity, provider interface, mock confirm, yookassa stub webhook
  storage/       # MinIO/S3 client
```

Foundation modules stay: `auth`, `users`, `rbac`, `impersonation` (policy extended), `audit`.

### Permission matrix

| Action | STUDENT | Course curator | ADMIN |
|--------|---------|----------------|-------|
| List published courses | yes | yes | yes |
| Create course | no | yes (becomes curator) | yes |
| Edit own course content | no | yes | yes (any) |
| Assign curator | no | no | yes |
| Free enroll | yes | yes | yes |
| Checkout (paid) | yes | yes | yes |
| Mock confirm payment (dev) | owner of payment | — | yes |
| Grant enroll | no | yes (own courses) | yes |
| Upload / set lesson video | no | yes (own) | yes |
| Playback lesson | enrolled / curator / admin | yes | yes |
| Impersonate enrolled student | no | yes (own courses) | yes |

---

## 4. Data model (Prisma extensions)

### New enums

```prisma
enum LessonType { VIDEO TEXT MIXED }
enum VideoSource { UPLOADED EXTERNAL_URL }
enum PaymentStatus { PENDING SUCCEEDED FAILED CANCELED REFUNDED }
enum PaymentProvider { MOCK YOOKASSA }
enum EnrollmentSource { FREE PAYMENT GRANT }
```

### Course (extend existing)

- `priceCents Int @default(0)` — amount in minor units; `0` = free  
- `currency String @default("RUB")`  
- relations: `modules`, `payments`

### CourseModule

- `courseId`, `title`, `description?`, `sortOrder`, timestamps  
- `lessons Lesson[]`  
- index `[courseId, sortOrder]`

### Lesson

- `moduleId`, `title`, `type`, `content?` (sanitized on write)  
- `videoSource?`, `videoUrl?`, `storageKey?`, `durationSec?`  
- `sortOrder`, `isPublished`, timestamps  
- Rules: if `UPLOADED` → `storageKey` required; if `EXTERNAL_URL` → `videoUrl` required and must pass playable-URL validation

### Enrollment (extend)

- `source EnrollmentSource`  
- `grantedBy String?`  
- `paymentId String? @unique` → optional `Payment`  
- unique `[courseId, userId]` unchanged

### Payment

- `courseId`, `userId`, `amountCents`, `currency`  
- `status`, `provider` (default `MOCK`)  
- `providerPaymentId?`, `confirmationUrl?`, `metadata Json?`  
- indexes on `[userId, status]`, `providerPaymentId`

### AuditAction additions

`COURSE_CREATE`, `COURSE_UPDATE`, `ENROLL`, `PAYMENT_CREATE`, `PAYMENT_SUCCEEDED`, `GRANT_ENROLL`, `LESSON_UPDATE`

---

## 5. Payments design (mock now, YooKassa later)

```ts
interface PaymentProvider {
  readonly name: PaymentProvider;
  createPayment(input: {
    paymentId: string;
    amountCents: number;
    currency: string;
    description: string;
    returnUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ providerPaymentId: string; confirmationUrl: string }>;
}
```

- **Now:** `MockPaymentProvider` — generates fake `providerPaymentId`, `confirmationUrl` like `http://localhost:3000/payments/mock/confirm-ui?paymentId=...` (or API-only confirm).  
- **Dev confirm:** `POST /payments/mock/confirm { paymentId }` — marks `SUCCEEDED`, creates `Enrollment` with `source=PAYMENT` (idempotent).  
- **Reserved:** `POST /payments/webhooks/yookassa` — returns clear “not configured” until real integration.  
- Env: `PAYMENT_PROVIDER=mock` (only supported value in Catalog). Setting `yookassa` without credentials fails fast at boot/checkout with explicit message.

Paid checkout rejected if `priceCents === 0` (use free enroll). Free enroll rejected if `priceCents > 0` (use checkout).

---

## 6. Storage / video

### MinIO (dev)

Docker Compose service `minio` + optional `minio-init` creating bucket `lessons`.

Env:

- `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE=true`

### Playback

`GET /lessons/:id/playback` (auth + access):

```json
{
  "source": "UPLOADED" | "EXTERNAL_URL",
  "kind": "direct" | "youtube" | "vimeo",
  "url": "https://..."
}
```

- Uploaded → time-limited signed GET URL  
- External → classified embed/direct URL for the future player  

Access if: admin, course curator, or active enrollment.

---

## 7. HTTP API summary

### Courses & content

| Method | Path | Auth |
|--------|------|------|
| GET | `/courses` | public or auth |
| GET | `/courses/:idOrSlug` | auth recommended |
| POST | `/courses` | curator/admin |
| PATCH | `/courses/:id` | curator owner/admin |
| POST | `/courses/:id/curators` | admin |
| POST | `/courses/:id/modules` | curator/admin |
| PATCH | `/modules/:id` | curator/admin |
| POST | `/modules/:id/lessons` | curator/admin |
| PATCH | `/lessons/:id` | curator/admin |
| POST | `/lessons/:id/video/upload` | curator/admin |
| PATCH | `/lessons/:id/video/external` | curator/admin |
| GET | `/lessons/:id/playback` | enrolled/curator/admin |

### Enrollment & payments

| Method | Path | Auth |
|--------|------|------|
| POST | `/courses/:id/enroll` | auth (free only) |
| POST | `/courses/:id/checkout` | auth (paid only) |
| POST | `/payments/mock/confirm` | auth (payment owner or admin) |
| POST | `/payments/webhooks/yookassa` | public stub |
| POST | `/courses/:id/grants` | curator/admin `{ userId }` |
| GET | `/me/enrollments` | auth |

---

## 8. Impersonation update

Extend Foundation policy:

1. ADMIN — any active non-ADMIN (unchanged)  
2. Curator — target must have `Enrollment` on at least one course where actor has `CourseMembership` role `CURATOR`  
3. Otherwise 403 with clear message  

---

## 9. Errors & security

- Same JSON error shape as Foundation  
- Sanitize lesson `content` on write  
- Validate external video URLs (https only; allowlist host patterns for youtube/vimeo or `.mp4` path)  
- Multipart upload size limit (configurable, e.g. 500MB)  
- Do not expose MinIO credentials to clients; only signed playback URLs  

---

## 10. Testing

1. Jest e2e: free course enroll; paid checkout → mock confirm → enrollment; grant; playback ACL; curator impersonation allow/deny  
2. Postman `postman/catalog.json`  
3. Extend test UI (`public/catalog.html` or section on index)  
4. Compose: postgres, redis, minio  

---

## 11. Implementation order

1. Prisma migration (modules, lessons, payment fields) + MinIO compose  
2. StorageModule  
3. Courses + modules + lessons CRUD  
4. Enrollments (free + grant) + access helper  
5. Payments mock + checkout/confirm + yookassa stub route  
6. Playback endpoint  
7. Curator impersonation policy  
8. Postman + e2e + test UI  

---

## 12. Next after Catalog

1. **Homework** — assignments, grading, XP  
2. **Analytics** — Neo4j + aggregates  
3. **YooKassa** — real `PaymentProvider` implementation  

---

## 13. Explicitly deferred

- Real YooKassa credentials and webhook signature verification  
- Adaptive bitrate / transcoding  
- Soft-delete / versioning of lessons  
- Multi-currency beyond RUB field readiness  
`)