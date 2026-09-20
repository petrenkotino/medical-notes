# Task 04: API Routes ✓ DONE

Implement the three required endpoints with Fastify JSON schemas.

## Endpoints

### POST /medical-note
- Body: `{ patientId, authorId, text }` (camelCase — matches postgres.camel transform)
- Calls: `createNote()`
- Returns: 201 + created note

### GET /medical-note/:id
- Calls: `getLatestNote(id)`
- Returns: 200 + note, or 404

### PUT /medical-note/:id
- Body: `{ authorId, text }` — append-only model; `authorId` identifies who wrote the revision
- Calls: `createNoteVersion(id, authorId, text)`
- Returns: 200 + new version, or 404

## Notes
- Fastify JSON schemas on request + response bodies enable `fast-json-stringify`
- UUID validated in params schema via regex pattern before hitting the DB
- 404 → `NoteNotFoundError`, 409 → `NoteConflictError` (concurrent PUT on same note)

## Files to create/modify
- `src/routes/medical-notes.ts` — route plugin with all three handlers
- `src/index.ts` — register the route plugin (runMigration already wired in Task 03)

## Done when
All three endpoints work correctly via curl.
