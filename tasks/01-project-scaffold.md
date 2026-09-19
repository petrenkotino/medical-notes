# Task 01: Project Scaffold ✓ DONE

Set up the TypeScript/Fastify project skeleton — no logic yet, just the base config files.

## Files to create
- `package.json` — dependencies, scripts (`dev`, `build`, `start`)
- `tsconfig.json` — strict TS, ES2022 target, NodeNext modules
- `.gitignore`
- `.env.example` — DATABASE_URL, PORT, DB_POOL_MAX

## Dependencies
- `fastify` — HTTP framework
- `postgres` — postgres.js DB client (has built-in connection pool)
- `tsx` — TS execution for dev (no compile step)
- `typescript`, `@types/node`

## Decisions
- [x] `@fastify/sensible` added
- [x] Node 24 (`engines: ">=24"`)

## Done when
`pnpm install` succeeds and `pnpm dev` starts a Fastify server on :3000 with a health check at `GET /health`.
