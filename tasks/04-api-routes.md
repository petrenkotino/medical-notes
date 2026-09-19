# Task 04: API Routes ✓ DONE

Implement the three required endpoints with Fastify JSON schemas and audit logging.

## Auth
All endpoints require `X-Actor-Id` header. Return 400 if missing.

## Endpoints

### POST /medical-note
- Body: `{ patientId, authorId, text }` (camelCase — matches postgres.camel transform)
- Calls: `createNote()` → `logAudit(id, 'created', actorId, { version: 1 })`
- Returns: 201 + created note

### GET /medical-note/:id
- Calls: `getLatestNote(id)` → `logAudit(id, 'accessed', actorId, { version })`
- Returns: 200 + note, or 404

### PUT /medical-note/:id
- Body: `{ text }` — append-only model; only text changes in a revision. `authorId` comes from `X-Actor-Id`.
- Calls: `createNoteVersion(id, actorId, text)` → `logAudit(id, 'updated', actorId, { version })`
- Returns: 200 + new version, or 404

## Notes
- Fastify JSON schemas on request + response bodies enable `fast-json-stringify`
- 404 returns `{ error: 'Not found' }`
- Invalid UUID format caught by postgres → 400
- `logAudit` is awaited — if audit insert fails, endpoint returns 500 (audit is a guarantee)

## Files to create/modify
- `src/routes/medical-notes.ts` — route plugin with all three handlers
- `src/index.ts` — register the route plugin (runMigration already wired in Task 03)

## Done when
All three endpoints work correctly via curl, including audit rows written to DB.
