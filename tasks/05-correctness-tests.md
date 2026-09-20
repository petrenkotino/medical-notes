# Task 05: Correctness Tests

Verify the API works correctly before load testing — happy paths, error cases, persistence, and concurrency.

## Test cases

### Happy path
- POST → returns 201 with all fields
- GET by returned id → returns same note
- PUT → returns version 2 with updated text
- GET after PUT → returns version 2

### Error cases
- GET with invalid UUID format → 400 (caught by schema, no DB hit)
- GET with valid UUID but no note → 404
- PUT on non-existent id → 404
- PUT with empty `text` or `authorId` → 400

### Persistence
- Start server, POST a note, restart server (`Ctrl+C` + `pnpm dev`), GET same id → still returns note

### Concurrency (concurrent PUTs)
- Fire 5 simultaneous PUTs at the same note id
- Assert: all responses are 200 or 409 — no 500s
- Assert: successful updates have unique, consecutive versions (no gaps, no duplicates)
- Assert: 200 count + 409 count = 5

## Method
`tests/correctness.test.ts` — TypeScript acceptance tests using `node:test` and `node:assert/strict`. Run with `pnpm test` (requires server to be running). Persistence is verified manually (server restart).

## Done when
All cases pass and documented with actual output.

## Status: DONE

Automated: `tests/correctness.test.ts` — 7 tests / 3 suites, all passing (`pnpm test`).

### Results

**Happy path** — all pass
- POST → 201, version 1, id returned
- GET → 200, same id and text
- PUT → 200, version 2
- GET after PUT → version 2, updated text

**Error cases** — all pass
- GET `not-a-uuid` → 400 (schema rejects before DB hit)
- GET `00000000-0000-0000-0000-000000000000` → 404
- PUT non-existent id → 404
- PUT empty `text` → 400
- PUT empty `authorId` → 400

**Persistence** — pass
- Restarted server; `GET /medical-note/4d36003d-c064-4bee-8736-ecd9c784bcfe` returned version 2 with updated text.

**Concurrency (5 simultaneous PUTs)** — pass
- Statuses: `200 200 200 409 200` (4 wins, 1 conflict)
- Winning versions: 2 3 4 5 — unique and consecutive, no gaps
- 200 + 409 = 5 ✓, no 500s ✓
