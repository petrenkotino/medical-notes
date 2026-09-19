import type { FastifyInstance } from 'fastify'
import {
  createNote,
  getLatestNote,
  createNoteVersion,
  logAudit,
  NoteNotFoundError,
  NoteConflictError,
} from '../db/queries.js'

const UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

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
      logAudit(note.id, 'created', actorId, { version: note.version })
        .catch(err => request.log.error({ err }, 'audit log failed'))

      return reply.code(201).send(note)
    },
  )

  // GET /medical-note/:id
  app.get<{ Params: { id: string } }>(
    '/medical-note/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: UUID_PATTERN } },
        },
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

      logAudit(note.id, 'accessed', actorId, { version: note.version })
        .catch(err => request.log.error({ err }, 'audit log failed'))

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
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: UUID_PATTERN } },
        },
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
        logAudit(note.id, 'updated', actorId, { version: note.version })
          .catch(err => request.log.error({ err }, 'audit log failed'))
        return note
      } catch (err) {
        if (err instanceof NoteNotFoundError) return reply.notFound()
        if (err instanceof NoteConflictError) return reply.conflict(err.message)
        throw err
      }
    },
  )
}
