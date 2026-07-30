# Online School API

Backend for olympiad prep online school (NestJS).

## Specs / plans

- Design: `docs/superpowers/specs/2026-07-30-foundation-auth-design.md`
- Plan: `docs/superpowers/plans/2026-07-30-foundation-auth.md`

## Prerequisites

- Node.js 20+
- Docker Desktop (Postgres 16 + Redis 7 via `docker-compose.yml`)

## Setup

```powershell
copy .env.example .env
# Fill ENCRYPTION_KEY and EMAIL_HMAC_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

docker compose up -d
npx prisma migrate dev --name foundation_init
npx prisma db seed   # after seed script is wired
npm run start:dev
```

Health: `GET http://localhost:3000/health`

## Test UI

With `npm run start:dev` open:

**http://localhost:3000/**

Simple console for register / login / me / refresh / reset / admin users / impersonation.

Admin seed (from `.env`): `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Postman

Import `postman/foundation-auth.json`. Variables: `baseUrl`, `adminEmail`, `adminPassword`.

## Tests

```powershell
npm test
npm run test:e2e
```

E2E needs Docker Postgres+Redis and a seeded admin (`npx prisma db seed`).

## Current Foundation status

- Auth: register, login, refresh, logout, forgot/reset password
- JWT guards, `/users/me`, `/admin/users`, throttling on `/auth/*`
- Impersonation (admin only)
- Postgres + Redis via Docker Compose
- Test UI in `public/`
- Postman collection + e2e smoke tests
