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
- Expect: exactly 1 succeeds (200), others return 409
- Verify no duplicate versions in DB

## Method
Manual curl or a small script — no test framework required for this task.

## Done when
All cases pass and documented with actual curl output.
