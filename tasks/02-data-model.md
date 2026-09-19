# Task 02: Data Model

Define the `medical_notes` table schema and TypeScript types.

## Suggested schema (open for discussion)
```sql
CREATE TABLE medical_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID NOT NULL,
  author_id   UUID NOT NULL,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Open questions for you
- [ ] Should `id`, `patient_id`, `author_id` be UUIDs or something else (e.g. `TEXT`, `BIGSERIAL`)?
- [ ] Is `text` the right column name? Any other fields needed (e.g. `title`, `note_type`, `status`)?
- [ ] Any NOT NULL constraints or defaults to add/remove?
- [ ] Index on `patient_id`? (useful if we later add `GET /medical-note?patient_id=...`)

## Files to create
- `src/db/migrations/001_init.sql`
- `src/types.ts` — TypeScript interface matching the schema

## Done when
Migration SQL is agreed upon and types are defined.
