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

Health check:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
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
- Concurrent PUTs to the same note id may race on the primary key; one will succeed and others return 409. Clients should retry on 409.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled output |

