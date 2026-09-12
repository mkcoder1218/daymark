# Daymark

Daymark is a personal daily-execution system: define one meaningful goal, work until it is achieved, and measure the cost of every break, distraction, and intentional switch.

## Stack

- `apps/web`: Next.js 16 + React 19 + GSAP
- `apps/api`: NestJS 12 + Prisma 7 + PostgreSQL
- Package manager: pnpm workspaces
- Deployment target: Vercel for both apps
- Telegram: outbound notifications only, configured by bot token + chat ID inside Daymark

## Local setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Web: `http://localhost:3000`
API: `http://localhost:3001/v1`

## Environment

### API

`apps/api/.env`

- `DATABASE_URL`: pooled PostgreSQL runtime URL
- `DIRECT_URL`: direct PostgreSQL URL for Prisma migrations
- `WEB_ORIGIN`: comma-separated allowed web origins
- `SETTINGS_ENCRYPTION_KEY`: long random secret used to encrypt the Telegram bot token before it is stored
- `PORT`: local API port, defaults to `3001`

### Web

`apps/web/.env.local`

- `NEXT_PUBLIC_API_URL`: API base URL including `/v1`

## Vercel

Create two Vercel projects from the same repository:

1. Web project root directory: `apps/web`
2. API project root directory: `apps/api`

Vercel supports NestJS directly. Configure the API environment variables in the API project and `NEXT_PUBLIC_API_URL` in the web project.

Run `pnpm --filter @daymark/api db:deploy` against the production database when schema migrations change.
