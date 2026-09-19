# Task 02: Data Model ✓ DONE

Immutable, append-only EHR data model with full audit logging.

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
CREATE INDEX IF NOT EXISTS idx_medical_notes_id_version ON medical_notes (id, version DESC);
CREATE INDEX IF NOT EXISTS idx_medical_notes_patient_id ON medical_notes (patient_id);

-- audit_log: append-only, never deleted
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id     UUID NOT NULL,
  entity_type   TEXT NOT NULL DEFAULT 'medical_note',
  action        TEXT NOT NULL CHECK (action IN ('created', 'updated', 'accessed')),
  actor_id      TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  details       JSONB
);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_id ON audit_log (entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_occurred_at ON audit_log (occurred_at);
```

## DB module (`src/db/pool.ts`)
- `sql` — postgres.js instance with `max: DB_POOL_MAX` (default 10, env-configurable for load test)
- `transform: postgres.camel` — auto-maps snake_case columns to camelCase
- `runMigration()` — reads and runs `001_create_tables.sql` via `sql.unsafe()` on startup

## Queries (`src/db/queries.ts`)
- `createNote(patientId, authorId, text)` — inserts version 1, returns full row
- `getLatestNote(id)` — fetches highest version for id, returns null if not found
- `createNoteVersion(id, authorId, text)` — CTE that reads max version and inserts version+1 atomically. PK constraint is concurrency safety net. Throws if note id doesn't exist.
- `logAudit(entityId, action, actorId, details?)` — awaited in the request path (audit is a guarantee). Every create/update/read does 2 sequential DB round-trips.

## Types (`src/types.ts`)
- `MedicalNote` — `{ id, patientId, authorId, text, version, createdAt }`
- `AuditEntry` — `{ id, entityId, entityType, action, actorId, occurredAt, details }`

## Key invariants
- `medical_notes` and `audit_log` are append-only — no UPDATE or DELETE
- Audit logging is best-effort (fire-and-forget with error logging) — not transactionally guaranteed
- Concurrent PUTs to the same note id may race on the PK; caught as `NoteConflictError` → 409
- `details` typed as `Record<string, string | number | boolean | null>` to satisfy postgres.js's JSONValue

## Indexes removed (auditor feedback)
- `idx_medical_notes_id_version (id, version DESC)` — redundant with the PK B-tree index
- `idx_medical_notes_patient_id` — unused by any required endpoint
