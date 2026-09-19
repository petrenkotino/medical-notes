# Task 03: Docker + Database ✓ DONE

Wire up PostgreSQL locally and call `runMigration()` on server startup.

Note: `src/db/pool.ts` (pool + `runMigration()`) was completed in Task 02.

## Files to create/modify
- `docker-compose.yml` — PostgreSQL 17, named volume for persistence, exposes 5432
- `src/index.ts` — call `await runMigration()` before `app.listen()`

## docker-compose approach
No initdb.d mount needed — `runMigration()` runs the SQL on every startup (idempotent via `IF NOT EXISTS`).

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: medical_notes
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
volumes:
  postgres_data:
```

## Done when
`docker-compose up -d` + `pnpm dev` connects to Postgres, runs migration, and `GET /health` returns 200.
