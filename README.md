# medical-notes

EHR-style medical notes CRUD API built with Fastify, TypeScript, and PostgreSQL.

## Prerequisites

- Docker

That's it to try the API. For development or load testing you also need Node.js >= 24 and pnpm.

## Run with Docker (quickest)

```bash
docker compose up -d
```

Starts both PostgreSQL and the API. Available at `http://localhost:3000`.

## Run for development / load testing

Running the app natively avoids Docker networking overhead, which matters for accurate load test measurements.

```bash
# First time only
cp .env.example .env
pnpm install

# Start PostgreSQL
docker compose up -d postgres

# Start the API with hot reload
pnpm dev
```

## Health endpoints

| Endpoint | Purpose | DB check |
|---|---|---|
| `GET /health` | Liveness — is the process up? | No |
| `GET /ready` | Readiness — is the DB reachable? | Yes (`SELECT 1`) |

```bash
curl http://localhost:3000/health  # {"status":"ok"}
curl http://localhost:3000/ready   # {"status":"ok"} or 503
```

## API

### POST /medical-note

```bash
curl -X POST http://localhost:3000/medical-note \
  -H "Content-Type: application/json" \
  -d '{"patientId": "patient-abc", "authorId": "dr-xyz", "text": "Patient presents with..."}'
```

### GET /medical-note/:id

```bash
curl http://localhost:3000/medical-note/<id>
```

### PUT /medical-note/:id

Creates a new version — notes are never modified in place.

```bash
curl -X PUT http://localhost:3000/medical-note/<id> \
  -H "Content-Type: application/json" \
  -d '{"authorId": "dr-xyz", "text": "Updated note text..."}'
```

## Data model

- `medical_notes` is append-only and versioned. Each PUT inserts a new row with `version + 1`. Each version's `created_at` is the authoritative timestamp for that revision.
- Concurrent PUTs to the same note id may conflict on the `(id, version)` primary key. Any conflicting PUT returns 409. Clients should retry on 409.

## Tests

Correctness tests cover happy path, error cases, and concurrency. They run against a live server — start the API first, then:

```bash
pnpm test
```

The suite hits `GET /ready` (defaults to `http://localhost:3000`) and fails immediately if the server is not up. Set `BASE_URL` to point at a different host.

Persistence is not automated — verified manually by restarting the server and re-fetching a previously created note.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled output |
| `pnpm test` | Run correctness tests (server must be running) |

