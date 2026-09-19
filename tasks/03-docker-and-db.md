# Task 03: Docker + Database

Wire up PostgreSQL locally and the DB connection pool.

## Files to create
- `docker-compose.yml` — PostgreSQL 16, auto-runs migration on first start
- `src/db/client.ts` — postgres.js pool, reads `DATABASE_URL` and `DB_POOL_MAX`

## docker-compose approach
Mount `001_init.sql` into `/docker-entrypoint-initdb.d/` so Postgres runs it on first boot.
No separate migration script needed for local dev.

## DB client
```typescript
// src/db/client.ts
import postgres from 'postgres'

export const sql = postgres(process.env.DATABASE_URL!, {
  max: parseInt(process.env.DB_POOL_MAX ?? '10'),
})
```

The `DB_POOL_MAX` env var is the lever for the load test improvement (1 → 10).

## Done when
`docker-compose up -d` starts Postgres and the table exists.
`pnpm dev` can connect to it without errors.
