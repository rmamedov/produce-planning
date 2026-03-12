# Kitchen Production Planner

Production-ready Next.js application for planning culinary production in retail stores.

The system has two primary interfaces:

- `Admin panel` for branches, assortment, products, tech cards, forecasts, tasks, settings and manual task creation
- `Kitchen tablet UI` with compact task cards, strict status-tree actions and full task detail view

## Stack

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- shadcn-style UI primitives
- PostgreSQL
- Prisma ORM
- TanStack Query
- TanStack Table
- React Hook Form + Zod
- Lucide icons
- Local file upload service for product images

## Architecture

Project layers:

- `domain` - domain enums and planning types
- `services` - auth, task generation, task workflow, dashboard and file storage
- `repositories` - Prisma-backed data access layer
- `api` - schemas, error handling, auth guard
- `ui` - App Router pages, admin shell, tablet cards and feature components

Main folders:

- `app`
- `components`
- `features`
- `services`
- `repositories`
- `domain`
- `api`
- `types`
- `mock`
- `prisma`

## Data model

The database includes:

- `Branch`
- `Assortment`
- `AssortmentItem`
- `Product`
- `TechnologicalCard`
- `TechCardIngredient`
- `TechCardStep`
- `TechCardEquipment`
- `Forecast`
- `Task`
- `Settings`

Note on stock placement:

- shared product catalog data lives in `Product`
- branch-specific `currentStock` and `hourlyTargetStock` live in `AssortmentItem`
- this keeps stock planning aligned with the fact that the same product can exist in multiple branches with different operational states

## Task generation

Implemented in [`services/task-generation/task-generation.service.ts`](/Users/ruslanmamedov/Desktop/Pruduce planing/services/task-generation/task-generation.service.ts) and [`services/task-generation/algorithm.ts`](/Users/ruslanmamedov/Desktop/Pruduce planing/services/task-generation/algorithm.ts).

Key guarantees:

- planning horizon: `4 hours` by default
- idempotent generation
- no duplicate active tasks for the same `branchId + productId`
- database transaction with `SERIALIZABLE` isolation
- explicit row locking on `AssortmentItem` and active `Task` rows
- partial unique index in [`prisma/migrations/202603120001_init/migration.sql`](/Users/ruslanmamedov/Desktop/Pruduce planing/prisma/migrations/202603120001_init/migration.sql)

Active tasks are:

- `NEW`
- `IN_PROGRESS`

When a generator run finds an existing active task, it updates it instead of creating a second one.

## Status tree

Supported workflow:

- `NEW -> IN_PROGRESS -> DONE`
- `IN_PROGRESS -> CANCELLED`

UI buttons follow the allowed transitions only:

- `NEW` -> `Почати виконання`
- `IN_PROGRESS` -> `Готово`, `Неможливо виготовити`
- `DONE` and `CANCELLED` -> no action buttons

## Routes

Public:

- `/`
- `/kitchen`
- `/kitchen/tasks/[id]`

Protected admin routes:

- `/admin`
- `/admin/branches`
- `/admin/assortments`
- `/admin/products`
- `/admin/tech-cards`
- `/admin/forecasts`
- `/admin/tasks`
- `/admin/manual-tasks`
- `/admin/task-generator`
- `/admin/settings`
- `/admin/login`

## Local setup

1. Copy env file:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Generate Prisma client and run migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

4. Seed demo data:

```bash
npm run prisma:seed
```

5. Start the app:

```bash
npm run dev
```

## Auth

Admin authentication uses a signed HTTP-only cookie derived from:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `AUTH_SECRET`

Middleware protects `/admin/*` except `/admin/login`.

## Automatic generation triggers

The generator is wired to run:

- manually from `/admin/task-generator`
- after forecast create/update/delete
- after assortment update
- after task completion or cancellation

For the `every 15 minutes` requirement, configure a cron job that calls:

- `POST /api/tasks/generate`

In production, this should be invoked by a scheduler such as Vercel Cron or an external job runner with authenticated access.

## Seed data

Seed script:

- creates several branches
- creates products and technological cards
- attaches products to branch assortments with stock and target stock
- inserts hourly forecasts
- inserts one historical completed task
- runs the automatic generator to create active tasks

Files:

- [`mock/sample-data.ts`](/Users/ruslanmamedov/Desktop/Pruduce planing/mock/sample-data.ts)
- [`prisma/seed.ts`](/Users/ruslanmamedov/Desktop/Pruduce planing/prisma/seed.ts)

## Notes

- product photo upload currently stores files in `public/uploads`
- this is wrapped in a service so it can be swapped to S3 or another object storage provider
- tablet board uses a compact responsive grid tuned for `1340x800`
- cards stay concise and are intended to show at least `3` tasks on screen, usually `4-5`
