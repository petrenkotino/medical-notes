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
docker-compose up -d

# Start the API (watches for changes)
pnpm dev
```

The API is available at `http://localhost:3000`.

Health check:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled output |

