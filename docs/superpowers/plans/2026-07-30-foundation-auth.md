# Foundation Auth & RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a NestJS modular-monolith Foundation: email/password auth, JWT+Redis refresh, field-level PII encryption, RBAC, admin impersonation, and password reset — testable via Postman/cURL without a real frontend.

**Architecture:** Single NestJS app at repo root (`src/`). Postgres via Prisma is source of truth; Redis holds refresh sessions and access blacklist; `CryptoService` hashes passwords (Argon2id) and encrypts PII (AES-256-GCM) with email blind index; course/Neo4j modules are stubs only.

**Tech Stack:** TypeScript, NestJS 11, Prisma 6, PostgreSQL 16, Redis 7, ioredis, `@nestjs/jwt`, passport-jwt, argon2, class-validator, class-transformer, helmet, `@nestjs/throttler`, Jest + Supertest, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-07-30-foundation-auth-design.md`

## Global Constraints

- Backend only — no React production UI; Postman + optional `stubs/auth-smoke.html` only.
- Passwords: Argon2id only (never reversible encryption). PII: AES-256-GCM + `emailHash` HMAC blind index.
- Open registration → `GlobalRole.STUDENT`. Curator is `CourseMembership` only (no global CURATOR).
- Access JWT TTL 15m; refresh opaque in response body, Redis TTL 7d, rotation + family reuse revocation.
- Impersonation: new access with `imp` claim; refresh unchanged; Foundation: only ADMIN may impersonate; never impersonate ADMIN; no nested impersonation.
- Email verification endpoints OFF; keep `EmailVerificationCode` + `emailVerifiedAt` in schema.
- Forgot-password: identical response always; login: always `"Invalid credentials"`.
- Refresh transport: JSON body (not cookie) in Foundation.
- Dev: `DEV_EXPOSE_RESET_TOKEN=true` may expose reset token for cURL; default false.
- Follow TDD: failing test → implement → pass → commit per task.
- Do not implement Catalog/Homework/Analytics beyond schema stubs and no-op modules.

---

## File structure (target)

```
docker-compose.yml
.env.example
package.json
nest-cli.json
tsconfig.json
prisma/schema.prisma
prisma/seed.ts
prisma/migrations/...
src/
  main.ts
  app.module.ts
  config/env.validation.ts
  config/configuration.ts
  common/
    crypto/crypto.service.ts
    crypto/crypto.module.ts
    filters/http-exception.filter.ts
    pipes/sanitize.pipe.ts
    decorators/public.decorator.ts
    decorators/current-user.decorator.ts
  prisma/prisma.module.ts
  prisma/prisma.service.ts
  redis/redis.module.ts
  redis/redis.service.ts
  mail/mail.module.ts
  mail/mail.sender.ts
  mail/dev-mail.sender.ts
  audit/audit.module.ts
  audit/audit.service.ts
  auth/
    auth.module.ts
    auth.controller.ts
    auth.service.ts
    dto/*.ts
    strategies/jwt.strategy.ts
    refresh-token.service.ts
  rbac/
    rbac.module.ts
    guards/jwt-auth.guard.ts
    guards/roles.guard.ts
    decorators/roles.decorator.ts
  users/
    users.module.ts
    users.controller.ts
    users.service.ts
    admin-users.controller.ts
    dto/*.ts
  impersonation/
    impersonation.module.ts
    impersonation.controller.ts
    impersonation.service.ts
    dto/impersonate.dto.ts
  courses/courses.module.ts
  neo4j/neo4j.module.ts
  neo4j/neo4j.service.ts
  health/health.module.ts
  health/health.controller.ts
test/
  crypto.service.spec.ts
  auth.e2e-spec.ts
  impersonation.e2e-spec.ts
postman/foundation-auth.json
stubs/auth-smoke.html
README.md
```

---

### Task 1: Scaffold NestJS + Docker + Config + Health skeleton

**Files:**
- Create: `package.json`, `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`, `docker-compose.yml`, `.env.example`, `.gitignore`, `src/main.ts`, `src/app.module.ts`, `src/config/env.validation.ts`, `src/config/configuration.ts`, `src/health/health.module.ts`, `src/health/health.controller.ts`, `README.md`
- Test: `test/health.e2e-spec.ts` (smoke after app boots; may skip DB until Task 3)

**Interfaces:**
- Consumes: none
- Produces: bootable Nest app; env schema with `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `ENCRYPTION_KEY` (32-byte base64), `EMAIL_HMAC_KEY` (base64), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DEV_EXPOSE_RESET_TOKEN`, `PORT`, `CORS_ORIGIN`

- [ ] **Step 1: Create Nest project files and dependencies**

From repo root (PowerShell):

```bash
npm init -y
npm install @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/config @nestjs/jwt @nestjs/passport @nestjs/throttler passport passport-jwt reflect-metadata rxjs class-validator class-transformer helmet argon2 ioredis @prisma/client sanitize-html
npm install -D @nestjs/cli @nestjs/testing @nestjs/schematics typescript ts-node @types/node @types/express @types/passport-jwt @types/sanitize-html jest ts-jest @types/jest supertest @types/supertest prisma
```

`nest-cli.json`:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true }
}
```

- [ ] **Step 2: Add `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: online_school
      POSTGRES_PASSWORD: online_school
      POSTGRES_DB: online_school
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
volumes:
  pgdata:
```

- [ ] **Step 3: Add `.env.example` and `src/config/env.validation.ts`**

Generate local keys later with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`env.validation.ts` — validate with `class-validator` plain class or zod; reject boot if `ENCRYPTION_KEY` / `EMAIL_HMAC_KEY` / `JWT_ACCESS_SECRET` missing.

- [ ] **Step 4: Wire `AppModule` + `HealthController` returning `{ status: 'ok' }` (deep checks in Task 3/4)**

```typescript
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
```

`main.ts`: Helmet, global ValidationPipe (`whitelist`, `forbidNonWhitelisted`, `transform`), CORS from config, listen `PORT`.

- [ ] **Step 5: Start compose + app; verify health**

```bash
docker compose up -d
npm run start:dev
curl http://localhost:3000/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json nest-cli.json tsconfig.json tsconfig.build.json docker-compose.yml .env.example .gitignore src README.md
git commit -m "chore: scaffold NestJS app with Docker and health endpoint"
```

---

### Task 2: CryptoService (Argon2id + AES-GCM + blind index)

**Files:**
- Create: `src/common/crypto/crypto.module.ts`, `src/common/crypto/crypto.service.ts`
- Test: `src/common/crypto/crypto.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigService` keys `ENCRYPTION_KEY`, `EMAIL_HMAC_KEY`
- Produces:
  - `normalizeEmail(email: string): string` — trim + lowercase
  - `hashPassword(plain: string): Promise<string>`
  - `verifyPassword(hash: string, plain: string): Promise<boolean>`
  - `encrypt(plain: string): string` — format `v1:<iv_b64>:<tag_b64>:<cipher_b64>`
  - `decrypt(payload: string): string`
  - `emailBlindIndex(email: string): string` — hex HMAC-SHA256 of normalized email
  - `hashToken(token: string): string` — SHA-256 hex (refresh/reset tokens)

Argon2id params (OWASP-aligned baseline): `memoryCost: 19456`, `timeCost: 2`, `parallelism: 1`.

- [ ] **Step 1: Write failing unit tests**

```typescript
describe('CryptoService', () => {
  it('hashes and verifies password', async () => {
    const hash = await crypto.hashPassword('Secret123!');
    expect(hash).not.toContain('Secret123!');
    expect(await crypto.verifyPassword(hash, 'Secret123!')).toBe(true);
    expect(await crypto.verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('encrypt/decrypt round-trip', () => {
    const enc = crypto.encrypt('user@example.com');
    expect(enc.startsWith('v1:')).toBe(true);
    expect(crypto.decrypt(enc)).toBe('user@example.com');
  });

  it('email blind index is stable and normalized', () => {
    const a = crypto.emailBlindIndex('  Foo@Bar.COM ');
    const b = crypto.emailBlindIndex('foo@bar.com');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx jest src/common/crypto/crypto.service.spec.ts -v
```

Expected: FAIL (module not found / CryptoService undefined)

- [ ] **Step 3: Implement `CryptoService` + export `CryptoModule` (global)**

Use Node `crypto.createHmac`, `createCipheriv('aes-256-gcm')`, `argon2.hash` / `argon2.verify`. Decode `ENCRYPTION_KEY` from base64 to 32 bytes.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest src/common/crypto/crypto.service.spec.ts -v
```

- [ ] **Step 5: Commit**

```bash
git add src/common/crypto
git commit -m "feat: add CryptoService for Argon2id, AES-GCM, and email blind index"
```

---

### Task 3: Prisma schema, migrate, admin seed, PrismaModule

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, `src/prisma/prisma.module.ts`, `src/prisma/prisma.service.ts`
- Modify: `package.json` scripts (`prisma:migrate`, `prisma:seed`), `src/app.module.ts`, `src/health/health.controller.ts` (check DB)
- Test: `test/prisma-seed.spec.ts` or script assertion via seed dry-run

**Interfaces:**
- Consumes: `CryptoService` in seed
- Produces: Prisma models per spec §5; `PrismaService` extends `PrismaClient`; seed creates ADMIN from `ADMIN_EMAIL` / `ADMIN_PASSWORD`

- [ ] **Step 1: Write `prisma/schema.prisma` exactly per design spec** (enums + User, EmailVerificationCode, PasswordResetToken, Course, CourseMembership, Enrollment, AuditLog)

Datasource:

```prisma
generator client {
  provider = "prisma-client-js"
}
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- [ ] **Step 2: Migrate**

```bash
npx prisma migrate dev --name foundation_init
npx prisma generate
```

Expected: migration applied, client generated.

- [ ] **Step 3: Implement `PrismaService` + global `PrismaModule`**

- [ ] **Step 4: Implement `prisma/seed.ts`**

```typescript
// normalize email → blind index → encrypt email/names → argon2 hash password
// upsert by emailHash; set globalRole ADMIN
```

Wire `"prisma": { "seed": "ts-node prisma/seed.ts" }` and run:

```bash
npx prisma db seed
```

Expected: one admin row; email column ciphertext not plaintext.

- [ ] **Step 5: Health checks Postgres `SELECT 1`**

- [ ] **Step 6: Commit**

```bash
git add prisma src/prisma src/health src/app.module.ts package.json
git commit -m "feat: add Prisma schema, migration, and admin seed"
```

---

### Task 4: RedisModule + RefreshTokenService

**Files:**
- Create: `src/redis/redis.module.ts`, `src/redis/redis.service.ts`, `src/auth/refresh-token.service.ts`
- Test: `src/auth/refresh-token.service.spec.ts` (ioredis-mock or real Redis from compose)

**Interfaces:**
- Consumes: `RedisService.get/set/del/exists`; `CryptoService.hashToken`
- Produces:
  - `RefreshTokenService.create(userId: string): Promise<{ refreshToken: string; familyId: string }>`
  - `rotate(oldToken: string): Promise<{ refreshToken: string; userId: string; familyId: string }>` — throws Unauthorized on missing; on reuse of revoked token revokes family
  - `revoke(token: string): Promise<void>`
  - `revokeAllForUser(userId: string): Promise<void>`
  - `blacklistAccessJti(jti: string, ttlSeconds: number): Promise<void>`
  - `isAccessBlacklisted(jti: string): Promise<boolean>`

Redis keys per spec: `os:refresh:{hash}`, `os:refresh_family:{familyId}`, `os:access_bl:{jti}`.

Refresh payload JSON: `{ userId, familyId, expiresAt }` with TTL 7 days. Family key stores `revoked=0|1` and optional set of hashes.

- [ ] **Step 1: Write failing tests for create → rotate → reuse-detects-theft**

```typescript
it('revokes family when old refresh is reused', async () => {
  const first = await refresh.create('user1');
  const second = await refresh.rotate(first.refreshToken);
  await expect(refresh.rotate(first.refreshToken)).rejects.toThrow();
  await expect(refresh.rotate(second.refreshToken)).rejects.toThrow();
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement Redis + RefreshTokenService; health checks Redis `PING`**

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/redis src/auth/refresh-token.service.ts src/auth/refresh-token.service.spec.ts src/health
git commit -m "feat: add Redis session store with refresh rotation and reuse detection"
```

---

### Task 5: Auth register + login + JWT access issue

**Files:**
- Create: `src/auth/auth.module.ts`, `src/auth/auth.service.ts`, `src/auth/auth.controller.ts`, `src/auth/dto/register.dto.ts`, `src/auth/dto/login.dto.ts`, `src/auth/types/jwt-payload.ts`, `src/audit/audit.module.ts`, `src/audit/audit.service.ts`
- Modify: `src/app.module.ts`, Throttler on auth routes
- Test: `test/auth.e2e-spec.ts` (register + login)

**Interfaces:**
- Consumes: `PrismaService`, `CryptoService`, `RefreshTokenService`, `JwtService`, `AuditService.append(action, actorId, targetId?, meta?, ip?, ua?)`
- Produces:
  - `AuthService.register({ email, password, firstName?, lastName? })` → `{ user, accessToken, refreshToken }`
  - `AuthService.login({ email, password })` → same; on failure throw UnauthorizedException(`Invalid credentials`)
  - Access payload: `{ sub, globalRole, jti }` (no `imp` yet); sign with 15m expiry

DTOs:

```typescript
export class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
}
```

- [ ] **Step 1: Write e2e failing test**

```typescript
it('registers then logs in', async () => {
  const email = `stu_${Date.now()}@test.local`;
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'Secret123!' })
    .expect(201);
  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: 'Secret123!' })
    .expect(200);
  expect(login.body.accessToken).toBeDefined();
  expect(login.body.refreshToken).toBeDefined();
});

it('login with wrong password returns Invalid credentials', async () => {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: 'missing@test.local', password: 'x' })
    .expect(401);
  expect(res.body.message).toBe('Invalid credentials');
});
```

- [ ] **Step 2: Run e2e — FAIL**

- [ ] **Step 3: Implement AuthService/Controller; audit LOGIN / USER_CREATE; sanitize pipe on string fields**

Register: if `emailHash` exists → `409 Conflict`. Store encrypted email/names, Argon2id hash, `globalRole: STUDENT`.

- [ ] **Step 4: Run e2e — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/auth src/audit test/auth.e2e-spec.ts src/common
git commit -m "feat: add register and login with JWT access and Redis refresh"
```

---

### Task 6: Refresh + logout

**Files:**
- Modify: `src/auth/auth.service.ts`, `src/auth/auth.controller.ts`
- Create: `src/auth/dto/refresh.dto.ts`, `src/auth/dto/logout.dto.ts`
- Test: extend `test/auth.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `POST /auth/refresh { refreshToken }` → new access + refresh
  - `POST /auth/logout { refreshToken }` (auth required) → revoke refresh + blacklist current access `jti`

- [ ] **Step 1: Write failing e2e** — login → refresh → old refresh fails; logout → refresh fails

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement rotate/logout + audit REFRESH / LOGOUT**

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/auth test/auth.e2e-spec.ts
git commit -m "feat: add refresh rotation and logout with access blacklist"
```

---

### Task 7: Mail stub + forgot/reset password

**Files:**
- Create: `src/mail/mail.sender.ts`, `src/mail/dev-mail.sender.ts`, `src/mail/mail.module.ts`, `src/auth/dto/forgot-password.dto.ts`, `src/auth/dto/reset-password.dto.ts`
- Modify: `src/auth/auth.service.ts`, `src/auth/auth.controller.ts`
- Test: extend `test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `MailSender.sendPasswordReset(emailPlain: string, token: string): Promise<void>`
- Produces:
  - `POST /auth/forgot-password { email }` → `{ message: 'If the email exists, a reset link was sent' }` always 200
  - `POST /auth/reset-password { token, newPassword }` → 204; revoke all refresh for user
  - Reset token: `crypto.randomBytes(32).toString('hex')`; store `hashToken(token)`; TTL 45 minutes
  - If `DEV_EXPOSE_RESET_TOKEN=true`, include `resetToken` in forgot response **only in that mode**

- [ ] **Step 1: Failing e2e with `DEV_EXPOSE_RESET_TOKEN=true` in test env**

```typescript
it('resets password and invalidates old credentials', async () => {
  // register → forgot → reset with exposed token → login old fails → login new works
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement MailModule (DevMailSender logs token), forgot/reset, audit PASSWORD_RESET_* **

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/mail src/auth test/auth.e2e-spec.ts
git commit -m "feat: add password reset via email token with Redis session revoke"
```

---

### Task 8: JWT strategy, RBAC guards, /users/me, /admin/users

**Files:**
- Create: `src/auth/strategies/jwt.strategy.ts`, `src/rbac/rbac.module.ts`, `src/rbac/guards/jwt-auth.guard.ts`, `src/rbac/guards/roles.guard.ts`, `src/rbac/decorators/roles.decorator.ts`, `src/common/decorators/public.decorator.ts`, `src/common/decorators/current-user.decorator.ts`, `src/users/users.module.ts`, `src/users/users.service.ts`, `src/users/users.controller.ts`, `src/users/admin-users.controller.ts`, `src/users/dto/update-profile.dto.ts`
- Modify: `src/app.module.ts`, `src/main.ts` (APP_GUARD JwtAuthGuard), mark auth/health `@Public()`
- Test: `test/users.e2e-spec.ts`

**Interfaces:**
- Consumes: JWT + Redis blacklist check in strategy/guard
- Produces request user shape:

```typescript
type AuthUser = {
  id: string;                 // effective user id (imp target or sub)
  realUserId: string;         // always JWT sub (impersonator when imp)
  globalRole: 'STUDENT' | 'ADMIN'; // role of effective user for most checks
  realGlobalRole: 'STUDENT' | 'ADMIN';
  jti: string;
  impersonation: null | { impersonatorId: string; targetUserId: string };
};
```

- `@Roles(GlobalRole.ADMIN)` uses **real** actor role for `/admin/*` (impersonating admin as student must NOT access admin list — check `realGlobalRole`).
- `GET /users/me` returns decrypted profile of **effective** user.
- `PATCH /users/me` updates name enc fields of effective user.
- `GET /admin/users` ADMIN only — list id, email, globalRole, isActive (decrypt email).

- [ ] **Step 1: Failing e2e** — me requires auth; admin forbidden for student; admin ok for admin seed

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement strategy/guards/users**

JwtStrategy `validate`: if blacklisted jti → unauthorized; load user by `imp?.targetUserId ?? sub`; inactive → 401.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/rbac src/users src/auth/strategies src/common/decorators test/users.e2e-spec.ts
git commit -m "feat: add JWT guards, profile endpoints, and admin user list"
```

---

### Task 9: Impersonation + audit enforcement

**Files:**
- Create: `src/impersonation/impersonation.module.ts`, `src/impersonation/impersonation.service.ts`, `src/impersonation/impersonation.controller.ts`, `src/impersonation/dto/impersonate.dto.ts`
- Modify: `src/auth/auth.service.ts` (helper `signAccessToken(user, imp?)`), JWT payload type
- Test: `test/impersonation.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `POST /auth/impersonate { userId }` → `{ accessToken }` (refresh unchanged)
  - `POST /auth/impersonate/stop` → `{ accessToken }` for real user
- Rules: caller must have no existing `imp`; `realGlobalRole === ADMIN`; target exists, active, `globalRole !== ADMIN`; else 403 with clear message for non-admin (`Impersonation is restricted to administrators in Foundation`)

- [ ] **Step 1: Failing e2e**

```typescript
it('admin impersonates student then /users/me is student; stop restores admin', async () => { /* ... */ });
it('student cannot impersonate', async () => { /* 403 */ });
it('cannot impersonate admin', async () => { /* 403 */ });
it('nested impersonation forbidden', async () => { /* 403 */ });
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement ImpersonationService + audit IMPERSONATE_START/STOP**

Access JWT while impersonating:

```typescript
{
  sub: impersonatorId,
  globalRole: target.globalRole,
  jti: newJti,
  imp: { impersonatorId, targetUserId: target.id }
}
```

Note: `sub` stays impersonator for audit/refresh ownership clarity; effective id from `imp.targetUserId` in strategy (per AuthUser mapping above).

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/impersonation src/auth test/impersonation.e2e-spec.ts
git commit -m "feat: add admin impersonation with audit trail"
```

---

### Task 10: Course/Neo4j stubs, sanitize polish, Postman, HTML stub, README

**Files:**
- Create: `src/courses/courses.module.ts`, `src/neo4j/neo4j.module.ts`, `src/neo4j/neo4j.service.ts`, `postman/foundation-auth.json`, `stubs/auth-smoke.html`
- Modify: `src/common/pipes/sanitize.pipe.ts`, `src/common/filters/http-exception.filter.ts`, `README.md`, `src/app.module.ts`
- Test: ensure full e2e suite green

**Interfaces:**
- `Neo4jService.isEnabled(): false`; `health()` returns `{ status: 'disabled' }` until Analytics.
- `CoursesModule` exports empty module (models already in Prisma).
- Postman collection covers: register, login, me, refresh, forgot/reset (dev), admin users, impersonate, stop, logout.
- HTML stub: forms posting to local API (fetch) for register/login/me.

- [ ] **Step 1: Add stubs + Postman + HTML**

- [ ] **Step 2: Run full test suite**

```bash
npm test
npm run test:e2e
```

Expected: all PASS

- [ ] **Step 3: Manual smoke with cURL (document in README)**

```bash
curl -s -X POST localhost:3000/auth/login -H "Content-Type: application/json" -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}"
```

- [ ] **Step 4: Commit**

```bash
git add src/courses src/neo4j src/common postman stubs README.md
git commit -m "chore: add stubs, Postman collection, and auth smoke HTML"
```

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| Modular Nest modules | 1, 5–10 |
| Argon2id + AES-GCM + blind index | 2, 3, 5 |
| Prisma schema + course stubs + EmailVerificationCode | 3 |
| Admin seed | 3 |
| Redis refresh rotation + reuse revoke + jti blacklist | 4, 6 |
| Register/login/refresh/logout | 5, 6 |
| Forgot/reset + MailSender | 7 |
| JWT guards, /users/me, /admin/users | 8 |
| Impersonation rules + audit | 9 |
| Neo4j stub, Postman, HTML stub | 10 |
| Throttling / helmet / validation / sanitize | 1, 5, 10 |
| No verify endpoints | — omitted intentionally |
| Curator impersonation denied | 9 (admin-only) |

No TBD placeholders. Types aligned: `AuthUser`, refresh APIs, JWT `imp` shape consistent across Tasks 5–9.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-30-foundation-auth.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
`)