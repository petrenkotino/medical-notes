# Task 02: Data Model ✓ DONE

Immutable, append-only EHR data model.

## Schema

```sql
-- medical_notes: append-only, versioned. No UPDATE or DELETE ever.
CREATE TABLE IF NOT EXISTS medical_notes (
  id            UUID NOT NULL DEFAULT gen_random_uuid(),
  patient_id    TEXT NOT NULL,
  author_id     TEXT NOT NULL,
  text          TEXT NOT NULL,
  version       INT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);
-- No additional indexes: PK B-tree covers (id, version DESC) lookups; patient_id unused by required endpoints.

```

## DB module (`src/db/pool.ts`)
- `sql` — postgres.js instance with `max: DB_POOL_MAX` (default 10, env-configurable for load test)
- `transform: postgres.camel` — auto-maps snake_case columns to camelCase
- `runMigration()` — reads and runs `001_create_tables.sql` via `sql.unsafe()` on startup

## Queries (`src/db/queries.ts`)
- `createNote(patientId, authorId, text)` — inserts version 1, returns full row
- `getLatestNote(id)` — fetches highest version for id, returns null if not found
- `createNoteVersion(id, authorId, text)` — CTE that reads max version and inserts version+1 atomically. PK constraint is concurrency safety net. Throws if note id doesn't exist.

## Types (`src/types.ts`)
- `MedicalNote` — `{ id, patientId, authorId, text, version, createdAt }`

## Key invariants
- `medical_notes` is append-only — no UPDATE or DELETE
- Each request does exactly 1 DB round-trip (note operation only)
- Concurrent PUTs to the same note id may race on the PK; caught as `NoteConflictError` → 409
- No additional indexes: PK covers version lookups; patient_id index omitted (no list endpoint)
