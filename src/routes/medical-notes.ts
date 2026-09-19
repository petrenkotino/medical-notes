import type { FastifyInstance } from 'fastify'
import {
  createNote,
  getLatestNote,
  createNoteVersion,
  logAudit,
} from '../db/queries.js'

const noteSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    patientId: { type: 'string' },
    authorId: { type: 'string' },
    text: { type: 'string' },
    version: { type: 'number' },
    createdAt: { type: 'string' },
  },
} as const

export async function medicalNotesRoutes(app: FastifyInstance) {
  // POST /medical-note
  app.post<{
    Body: { patientId: string; authorId: string; text: string }
  }>(
    '/medical-note',
    {
      schema: {
        body: {
          type: 'object',
          required: ['patientId', 'authorId', 'text'],
          properties: {
            patientId: { type: 'string' },
            authorId: { type: 'string' },
            text: { type: 'string' },
          },
        },
        response: { 201: noteSchema },
      },
    },
    async (request, reply) => {
      const actorId = request.headers['x-actor-id']
      if (!actorId || typeof actorId !== 'string') {
        return reply.badRequest('X-Actor-Id header is required')
      }

      const { patientId, authorId, text } = request.body
      const note = await createNote(patientId, authorId, text)
      await logAudit(note.id, 'created', actorId, { version: note.version })

      return reply.code(201).send(note)
    },
  )

  // GET /medical-note/:id
  app.get<{ Params: { id: string } }>(
    '/medical-note/:id',
    {
      schema: {
        response: { 200: noteSchema },
      },
    },
    async (request, reply) => {
      const actorId = request.headers['x-actor-id']
      if (!actorId || typeof actorId !== 'string') {
        return reply.badRequest('X-Actor-Id header is required')
      }

      const note = await getLatestNote(request.params.id)
      if (!note) return reply.notFound()

      await logAudit(note.id, 'accessed', actorId, { version: note.version })

      return note
    },
  )

  // PUT /medical-note/:id
  app.put<{
    Params: { id: string }
    Body: { text: string }
  }>(
    '/medical-note/:id',
    {
      schema: {
        body: {
          type: 'object',
          required: ['text'],
          properties: {
            text: { type: 'string' },
          },
        },
        response: { 200: noteSchema },
      },
    },
    async (request, reply) => {
      const actorId = request.headers['x-actor-id']
      if (!actorId || typeof actorId !== 'string') {
        return reply.badRequest('X-Actor-Id header is required')
      }

      try {
        const note = await createNoteVersion(
          request.params.id,
          actorId,
          request.body.text,
        )
        await logAudit(note.id, 'updated', actorId, { version: note.version })
        return note
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return reply.notFound()
        }
        throw err
      }
    },
  )
}
