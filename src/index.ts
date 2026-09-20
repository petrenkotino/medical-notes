import 'dotenv/config'
import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import { runMigration, sql } from './db/pool.js'
import { medicalNotesRoutes } from './routes/medical-notes.js'

const app = Fastify({ logger: true })

app.register(sensible)
app.register(medicalNotesRoutes)

// Liveness — always 200 if the process is up
app.get('/health', async () => ({ status: 'ok' }))

// Readiness — 200 only when the DB is reachable
app.get('/ready', async (_, reply) => {
  try {
    await sql`SELECT 1`
    return { status: 'ok' }
  } catch {
    return reply.code(503).send({ status: 'unavailable' })
  }
})

const start = async () => {
  try {
    await runMigration()
    const port = parseInt(process.env.PORT ?? '3000')
    await app.listen({ port, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

process.on('SIGTERM', async () => {
  await app.close()
  await sql.end()
})

start()
