# medical-notes

EHR-style medical notes CRUD API built with Fastify, TypeScript, and PostgreSQL.

## Prerequisites

- Node.js >= 24
- pnpm
- Docker (for PostgreSQL)

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env file and adjust if needed
cp .env.example .env
```

## Run locally

```bash
# Start PostgreSQL
docker compose up -d

# Start the API (watches for changes, loads .env automatically)
pnpm dev
```

The API is available at `http://localhost:3000`.

Health check:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

## API

All endpoints require the `X-Actor-Id` header (identifies who is performing the action for audit logging).

### POST /medical-note

```bash
curl -X POST http://localhost:3000/medical-note \
  -H "Content-Type: application/json" \
  -H "X-Actor-Id: user-123" \
  -d '{"patientId": "patient-abc", "authorId": "dr-xyz", "text": "Patient presents with..."}'
```

### GET /medical-note/:id

```bash
curl http://localhost:3000/medical-note/<id> \
  -H "X-Actor-Id: user-123"
```

### PUT /medical-note/:id

Updates create a new version — notes are never modified in place.

```bash
curl -X PUT http://localhost:3000/medical-note/<id> \
  -H "Content-Type: application/json" \
  -H "X-Actor-Id: user-123" \
  -d '{"text": "Updated note text..."}'
```

## Data model

- `medical_notes` is append-only and versioned. Each PUT creates a new row with `version + 1`.
- `audit_log` records every create, update, and read with the actor and timestamp.
- Every request performs 2 sequential DB round-trips: the note operation + the audit insert.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled output |

