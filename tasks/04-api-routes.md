# Task 04: API Routes

Implement the three required endpoints with Fastify JSON schemas.

## Endpoints

### POST /medical-note
- Body: `{ patient_id, author_id, text }`
- Returns: created note (201)

### GET /medical-note/:id
- Returns: note or 404

### PUT /medical-note/:id
- Body: `{ patient_id?, author_id?, text? }` (partial update)
- Returns: updated note or 404

## Notes
- Fastify JSON schemas on both request and response enable `fast-json-stringify` (faster than `JSON.stringify`)
- 404 returns `{ error: "Not found" }`
- Invalid UUID format → 400

## Files to create/modify
- `src/routes/medical-notes.ts` — route plugin with all three handlers
- `src/index.ts` — register the route plugin

## Done when
All three endpoints work correctly via curl.
