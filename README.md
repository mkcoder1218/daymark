# Daymark

Daymark is a personal daily-execution system: define one meaningful goal, work until it is achieved, and measure the cost of every break, distraction, and intentional switch.

## Stack

- `apps/web`: Next.js 16 + React 19 + GSAP
- `apps/api`: NestJS 12 + Prisma 7 + PostgreSQL
- Package manager: pnpm workspaces
- Deployment target: Vercel for both apps
- Telegram: outbound notifications only, configured by bot token + chat ID inside Daymark

## Local setup

Daymark uses one shared environment file at the repository root for both apps.

```bash
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Web: `http://localhost:3000`
API: `http://localhost:3001/v1`

## Environment

Create a single root file:

```text
.env
```

The root `.env` is loaded by Next.js, NestJS, and Prisma during local development.

- `DATABASE_URL`: PostgreSQL runtime connection string. A Neon pooled connection URL is recommended for deployment.
- `DIRECT_URL`: optional direct PostgreSQL URL for Prisma migrations. Leave blank to reuse `DATABASE_URL`.
- `WEB_ORIGIN`: comma-separated allowed web origins for the API.
- `SETTINGS_ENCRYPTION_KEY`: long random secret used to encrypt the Telegram bot token before it is stored.
- `PORT`: local NestJS API port, defaults to `3001`.
- `NEXT_PUBLIC_API_URL`: API base URL including `/v1`.

Use `.env.example` as the complete template. Never commit the real `.env` file.

## Vercel

Create two Vercel projects from the same repository:

1. Web project root directory: `apps/web`
2. API project root directory: `apps/api`

The root `.env` is for local development only. In Vercel, add the same variables through each project's Environment Variables settings:

- Web project: `NEXT_PUBLIC_API_URL`
- API project: `DATABASE_URL`, optional `DIRECT_URL`, `WEB_ORIGIN`, `SETTINGS_ENCRYPTION_KEY`, and `PORT` when needed

Vercel supports NestJS directly. Run `pnpm --filter @daymark/api db:deploy` against the production database when schema migrations change.
