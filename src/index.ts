import Fastify from 'fastify'
import sensible from '@fastify/sensible'

const app = Fastify({ logger: true })

app.register(sensible)

app.get('/health', async () => ({ status: 'ok' }))

const start = async () => {
  try {
    const port = parseInt(process.env.PORT ?? '3000')
    await app.listen({ port, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
