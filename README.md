# Daymark

Daymark is a personal execution system: queue meaningful outcomes, work them in sequence, and measure what each goal actually costs in focused time, breaks, distractions, intentional switches, and total elapsed time.

Goals are not reset at midnight. Each goal records the date it was set, can continue for as many days as needed, and produces a full completion report when finished.

## Stack

- `apps/web`: Next.js 16 + React 19 + GSAP
- `apps/api`: NestJS 12 + Prisma 7 + PostgreSQL
- Authentication: email/password with scrypt password hashing and signed bearer sessions
- Package manager: pnpm workspaces
- Deployment target: Vercel for both apps
- Telegram: outbound notifications only, configured per account from the Profile page

## Local setup

Daymark uses one shared environment file at the repository root for both apps.

```bash
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Next.js normally starts on `http://localhost:3000` and may move to `3001` if that port is occupied.
The NestJS API intentionally uses `http://localhost:4000/v1` in local development so it cannot collide with Next.js.

After migrations finish, create your account from the signup modal. If the database contains goals or Telegram settings created before authentication was added, the first account automatically claims those records.

## Goal lifecycle

Goals receive an account-wide sequence number in creation order.

- Only one goal can be active at a time.
- Goal `#5` cannot start until every earlier unfinished goal is complete.
- A goal keeps running across dates until it is completed.
- The Timer page is always visible, even with an empty queue.
- Completion reports include the set date, completion date, total elapsed time, focused time, distracted time, break time, intentional-switch time, interruption count, longest focus run, and focus share.

## Weekly, monthly, and yearly reports

The Reports page calculates period reports directly from the goal and activity history.

For each week, month, or year it shows:

- goals set during the period
- goals achieved during the period
- goals not achieved by the period boundary
- goals carried in from an earlier period
- goals that missed the boundary but were completed later
- focused time
- distracted time
- break time
- intentional-switch time
- interruption count
- longest focus run
- completion rate

A current period is shown as a live report. Once the week, month, or year has ended, the same report automatically becomes a final historical report. Monday is treated as the start of the week.

## Account and Profile

Daymark requires authentication before personal data is loaded.

The Profile page allows you to:

- update full name
- update email
- change password after confirming the current password
- configure Telegram notifications with a bot token and chat ID
- enable or disable Telegram delivery
- send a test Telegram notification
- sign out

Telegram bot tokens are encrypted before being stored and are never returned to the browser.

## Environment

Create a single root file:

```text
.env
```

The root `.env` is loaded by Next.js, NestJS, and Prisma during local development.

- `DATABASE_URL`: PostgreSQL runtime connection string. A Neon pooled connection URL is recommended for deployment.
- `DIRECT_URL`: optional direct PostgreSQL URL for Prisma migrations. Leave blank to reuse `DATABASE_URL`.
- `API_PORT`: local NestJS API port, defaults to `4000`.
- `WEB_ORIGIN`: comma-separated allowed production web origins. Common localhost origins are also allowed during development.
- `SETTINGS_ENCRYPTION_KEY`: long random secret used to encrypt Telegram bot tokens before storage.
- `JWT_SECRET`: a different long random secret used to sign account sessions.
- `NEXT_PUBLIC_API_URL`: API base URL including `/v1`.

Use `.env.example` as the complete template. Never commit the real `.env` file.

## Vercel

Create two Vercel projects from the same repository:

1. Web project root directory: `apps/web`
2. API project root directory: `apps/api`

The root `.env` is for local development only. In Vercel, add the same variables through each project's Environment Variables settings:

- Web project: `NEXT_PUBLIC_API_URL`
- API project: `DATABASE_URL`, optional `DIRECT_URL`, `WEB_ORIGIN`, `SETTINGS_ENCRYPTION_KEY`, and `JWT_SECRET`

Vercel supplies its own runtime `PORT` in production. Daymark uses `API_PORT` only for local development.

Run `pnpm --filter @daymark/api db:deploy` against the production database when schema migrations change.
