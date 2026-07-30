# Foundation: Auth, RBAC, Impersonation — Design Spec

**Date:** 2026-07-30  
**Status:** Draft for user review  
**Scope:** Backend only (NestJS). No production frontend. Testing via Postman/cURL and optional HTML stubs.

---

## 1. Context and goals

Online school for olympiad preparation. Full product includes courses, homework (auto/manual grading), XP gamification, Redis caching, Neo4j analytics, and a future React frontend.

This document covers **Slice A — Foundation** only: identity, security, RBAC, impersonation, password recovery, and schema stubs for later slices.

### Out of scope (later slices)

- Course/lesson CRUD and content management (Catalog)
- Homework constructor, submissions, grading, XP (Homework)
- Engagement logs, Neo4j graph writes, Recharts/radar aggregates (Analytics)
- OAuth providers
- Email verification **endpoints** (schema reserved; feature off)

---

## 2. Decisions (locked)

| Topic | Choice |
|-------|--------|
| Architecture | Modular monolith (NestJS) |
| Auth | Email + password |
| Tokens | JWT access + opaque refresh in Redis (rotation + reuse detection) |
| Roles | Global `STUDENT` \| `ADMIN`; curator via `CourseMembership` (not a global role) |
| Registration | Open `POST /auth/register` → default `STUDENT` |
| Email verification | Disabled in runtime; schema + code-hash model reserved |
| Impersonation | `POST /auth/impersonate` issues new access JWT with `imp` claims; refresh stays with real actor |
| Password recovery | Email reset link/token; token stored hashed in Postgres |
| PII at rest | AES-256-GCM field encryption + email blind index (HMAC) |
| Passwords at rest | Argon2id hash only (never reversible encryption) |
| Curator impersonation in Foundation | Denied until Catalog memberships exist; only `ADMIN` may impersonate |
| Cannot impersonate | `ADMIN` users; nested impersonation forbidden |

---

## 3. NestJS module structure

```
src/
├── main.ts
├── app.module.ts
├── common/           # filters, pipes, sanitize, CryptoService, decorators
├── config/           # validated env (ENCRYPTION_KEY, EMAIL_HMAC_KEY, JWT_*, Redis, DB)
├── prisma/           # PrismaModule / PrismaService
├── redis/            # RedisModule (ioredis)
├── mail/             # MailSender interface; DevMailSender logs to console
├── auth/             # register, login, refresh, logout, forgot/reset password
├── users/            # /users/me, admin user list
├── rbac/             # guards, @Public, @Roles, effective-role resolution
├── impersonation/    # start/stop + policy
├── audit/            # AuditLog persistence
├── courses/          # stub module (no CRUD controllers in Foundation)
├── neo4j/            # stub module (health/no-op)
└── health/           # GET /health (Postgres + Redis)
```

### Module boundaries

| Module | Owns | Must not own |
|--------|------|--------------|
| `auth` | Credentials, JWT issue/rotate, refresh lifecycle, password reset | Course permissions |
| `rbac` | Guards, global role checks, reading `imp` from JWT | User profile CRUD |
| `impersonation` | Start/stop policy, audit triggers | Content/homework |
| `users` | Profile read/update, admin list | Enrollment business logic |
| `courses` | Prisma models only (stub) | Public course APIs |
| `audit` | Append-only security events | Neo4j analytics |
| `mail` | Sending reset (and later verify) messages | Token generation logic (stays in auth) |
| `common` / `CryptoService` | Argon2id, AES-GCM, blind index | HTTP concerns |

### Cross-cutting security

- Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`)
- Input sanitization for string DTO fields (XSS mitigation)
- Helmet, CORS from config
- Throttling on `/auth/login`, `/auth/register`, `/auth/forgot-password`
- SQL injection mitigated by Prisma parameterized queries + typed DTOs
- HTTPS assumed in production; tokens never logged in plaintext

---

## 4. Cryptography

| Data | Storage | Algorithm |
|------|---------|-----------|
| Password | `User.passwordHash` | Argon2id |
| Email | `User.emailEnc` | AES-256-GCM (+ key version in payload) |
| First/last name | `*Enc` columns | AES-256-GCM |
| Email lookup | `User.emailHash` unique | HMAC-SHA256(`EMAIL_HMAC_KEY`, normalized email) |
| Refresh token | Redis value keyed by hash | Store hash of opaque token, not raw token |
| Reset / verify codes | `*Hash` columns | Hash of one-time secret |

Keys: `ENCRYPTION_KEY`, `EMAIL_HMAC_KEY`, `JWT_ACCESS_SECRET` from environment / secret manager only. Ciphertext includes key version to allow rotation.

Application decrypts PII only when building API responses over TLS. Audit `meta` must not contain plaintext PII.

---

## 5. PostgreSQL (Prisma) schema

Conceptual models for Foundation migrations:

```prisma
enum GlobalRole {
  STUDENT
  ADMIN
}

enum MembershipRole {
  CURATOR
}

enum EnrollmentStatus {
  ACTIVE
  SUSPENDED
  COMPLETED
}

enum AuditAction {
  LOGIN
  LOGOUT
  REFRESH
  IMPERSONATE_START
  IMPERSONATE_STOP
  USER_CREATE
  USER_UPDATE
  PASSWORD_CHANGE
  PASSWORD_RESET_REQUEST
  PASSWORD_RESET_COMPLETE
}

model User {
  id              String     @id @default(cuid())
  emailEnc        String
  emailHash       String     @unique
  passwordHash    String
  firstNameEnc    String?
  lastNameEnc     String?
  globalRole      GlobalRole @default(STUDENT)
  emailVerifiedAt DateTime?
  isActive        Boolean    @default(true)
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  memberships         CourseMembership[]
  enrollments         Enrollment[]
  auditLogs           AuditLog[]              @relation("ActorLogs")
  auditAsTarget       AuditLog[]              @relation("TargetLogs")
  verificationCodes   EmailVerificationCode[]
  passwordResetTokens PasswordResetToken[]
}

model EmailVerificationCode {
  id         String    @id @default(cuid())
  userId     String
  codeHash   String
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime  @default(now())
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model PasswordResetToken {
  id         String    @id @default(cuid())
  userId     String
  tokenHash  String
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime  @default(now())
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([tokenHash])
}

model Course {
  id          String   @id @default(cuid())
  title       String
  slug        String   @unique
  description String?
  isPublished Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  memberships CourseMembership[]
  enrollments Enrollment[]
}

model CourseMembership {
  id        String         @id @default(cuid())
  courseId  String
  userId    String
  role      MembershipRole
  createdAt DateTime       @default(now())

  course Course @relation(fields: [courseId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([courseId, userId])
  @@index([userId])
}

model Enrollment {
  id        String           @id @default(cuid())
  courseId  String
  userId    String
  status    EnrollmentStatus @default(ACTIVE)
  createdAt DateTime         @default(now())

  course Course @relation(fields: [courseId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([courseId, userId])
  @@index([userId])
}

model AuditLog {
  id        String      @id @default(cuid())
  actorId   String?
  targetId  String?
  action    AuditAction
  ip        String?
  userAgent String?
  meta      Json?
  createdAt DateTime    @default(now())

  actor  User? @relation("ActorLogs", fields: [actorId], references: [id], onDelete: SetNull)
  target User? @relation("TargetLogs", fields: [targetId], references: [id], onDelete: SetNull)

  @@index([actorId, createdAt])
  @@index([action, createdAt])
}
```

**Seed:** one `ADMIN` from env (`ADMIN_EMAIL`, `ADMIN_PASSWORD`), stored with encryption + Argon2id like any user.

**Note:** `Course` / membership / enrollment tables ship as migrations in Foundation; no course HTTP API until Catalog.

---

## 6. Redis and JWT

### Token policy

| Token | Client storage | TTL | Notes |
|-------|----------------|-----|-------|
| Access JWT | Memory / Authorization header | 15 minutes | Contains `sub`, `globalRole`, `jti`, optional `imp` |
| Refresh | Response body in Foundation (Postman/cURL); httpOnly cookie optional later for web | 7 days | Opaque; Redis stores metadata under token hash |
| Password reset | Email only | 30–60 minutes | One-time; hashed in Postgres |

Access JWT `imp` claim shape:

```json
{
  "impersonatorId": "<real user id>",
  "targetUserId": "<effective user id>"
}
```

Effective identity for authorization: `imp.targetUserId` if present, else `sub`. Audit actor is always the real user (`impersonatorId` or `sub`).

### Refresh rotation

- Each refresh issues a new refresh token and invalidates the old hash.
- Tokens share a `familyId`. Reuse of a revoked/old token revokes the entire family (theft detection).
- Logout deletes the refresh key; optionally blacklists access `jti` until expiry.

### Redis key layout (prefix `os:`)

| Key | Value |
|-----|--------|
| `os:refresh:{tokenHash}` | `{ userId, familyId, expiresAt }` |
| `os:refresh_family:{familyId}` | revoked flag / members |
| `os:access_bl:{jti}` | `1` with TTL = remaining access life |
| `os:pwd_reset_rate:{emailHash}` | rate limit counter |
| `os:auth_throttle:{ip}` | login/register throttle |

---

## 7. Impersonation rules

1. `POST /auth/impersonate { userId }` — requires authenticated non-impersonating session.
2. **ADMIN** may impersonate any active non-ADMIN user.
3. **Curator → student** deferred to Catalog (Foundation: deny with clear error).
4. Target must be `isActive = true`.
5. Nested impersonation forbidden (reject if JWT already has `imp`).
6. New **access** token only; refresh unchanged.
7. `POST /auth/impersonate/stop` — issues access for `impersonatorId` without `imp`.
8. Every start/stop writes `AuditLog`.

Permission matrix (Foundation):

| Action | STUDENT | Course curator | ADMIN |
|--------|---------|----------------|-------|
| Own profile | yes | yes | yes |
| Impersonate student | no | no (until Catalog) | yes |
| Impersonate curator | no | no | yes |
| Impersonate admin | no | no | no |
| Stop own impersonation | yes | yes | yes |
| Admin user list | no | no | yes |

---

## 8. HTTP API (Foundation)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/register` | public | Create STUDENT |
| POST | `/auth/login` | public | Access + refresh |
| POST | `/auth/refresh` | refresh | Rotate tokens |
| POST | `/auth/logout` | access | Revoke refresh (+ optional jti blacklist) |
| POST | `/auth/forgot-password` | public | Always generic success; send email if user exists |
| POST | `/auth/reset-password` | public | `{ token, newPassword }` → new Argon2id hash; revoke all refresh |
| GET | `/users/me` | access | Profile (decrypted fields) |
| PATCH | `/users/me` | access | Update name fields |
| POST | `/auth/impersonate` | access | Start impersonation |
| POST | `/auth/impersonate/stop` | access + imp | Stop impersonation |
| GET | `/admin/users` | ADMIN (real actor) | List users (no PII beyond needed; decrypt for admin) |
| GET | `/health` | public | Postgres + Redis |

Password reset anti-enumeration: forgot-password response identical whether email exists or not.

Dev-only: if `DEV_EXPOSE_RESET_TOKEN=true`, reset token may appear in logs/response to enable cURL without SMTP. Default off.

---

## 9. Password reset flow

1. Client submits email → blind index lookup.
2. If user exists: create `PasswordResetToken` (store hash), email link/token via `MailSender`.
3. Client submits token + new password → verify hash, unexpired, unconsumed → update `passwordHash`, set `consumedAt`, revoke Redis refresh families for user, audit `PASSWORD_RESET_COMPLETE`.
4. `MailSender`: production SMTP/provider; development console logger.

---

## 10. Neo4j conceptual model (Analytics slice — stub only now)

Postgres remains source of truth. Foundation ships `neo4j` module as no-op/health.

Intended graph later:

```
(:User {id})-[:ENROLLED_IN]->(:Course {id})
(:User)-[:VIEWED {progress, durationSec, at}]->(:Lesson {id})
(:User)-[:SKIPPED]->(:Lesson)
(:User)-[:SUBMITTED {score, at}]->(:Assignment {id})
(:Lesson)-[:COVERS]->(:Topic {id})
(:Assignment)-[:TESTS]->(:Topic)
(:User)-[:STRUGGLING_WITH {weight}]->(:Topic)
```

Node ids match Postgres `cuid` values. Sync via domain events/outbox in later slices.

---

## 11. Error handling and testing

### Errors

- Consistent JSON error shape: `{ statusCode, error, message, requestId? }`.
- Auth failures: `401`; forbidden (impersonation policy): `403`; validation: `400`.
- Login always returns generic "Invalid credentials" (no email enumeration). Forgot-password always returns the same generic success.

### Testing without frontend

1. Postman collection `postman/foundation-auth.json` covering full happy path and impersonation.
2. Optional `stubs/auth-smoke.html` for manual browser checks.
3. Jest + Supertest for auth, crypto (hash/verify, encrypt round-trip, blind index), refresh reuse revocation.
4. Seed admin + optional student for local smoke.

### Implementation order (after plan approval)

1. NestJS scaffold + Config + Prisma + Redis + Health  
2. CryptoService + User migrations + admin seed  
3. Auth register/login/refresh/logout  
4. Forgot/reset + Mail stub  
5. RBAC guards + `/users/me` + `/admin/users`  
6. Impersonation + AuditLog  
7. Postman collection + stubs + smoke tests  

---

## 12. Roadmap after Foundation

1. **Catalog** — course CRUD, lessons, enrollment APIs, activate curator impersonation rules.  
2. **Homework** — assignment types (auto/manual), submissions, XP.  
3. **Analytics** — event ingestion, Neo4j sync, aggregates for Recharts / wind-rose.

---

## 13. Open points explicitly deferred (not blockers)

- OAuth social login  
- Email verification runtime flow (schema ready)  
- Host-level Postgres TDE (ops concern; app-level field encryption is mandatory)  
- Exact Argon2id memory/time parameters (implementation plan; follow OWASP recommendations)  
- httpOnly cookie transport for refresh (web frontend slice; Foundation uses body)
`)