import type { FastifyInstance } from 'fastify'
import {
  createNote,
  getLatestNote,
  createNoteVersion,
  NoteNotFoundError,
  NoteConflictError,
} from '../db/queries.js'

const UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

const noteSchema = {
  type: 'object',
  required: ['id', 'patientId', 'authorId', 'text', 'version', 'createdAt'],
  properties: {
    id: { type: 'string' },
    patientId: { type: 'string' },
    authorId: { type: 'string' },
    text: { type: 'string' },
    version: { type: 'integer' },
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
          additionalProperties: false,
          properties: {
            patientId: { type: 'string', minLength: 1, maxLength: 255 },
            authorId: { type: 'string', minLength: 1, maxLength: 255 },
            text: { type: 'string', minLength: 1, maxLength: 10000 },
          },
        },
        response: { 201: noteSchema },
      },
    },
    async (request, reply) => {
      const { patientId, authorId, text } = request.body
      const note = await createNote(patientId, authorId, text)
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
    async (_, reply) => {
      const note = await getLatestNote(_.params.id)
      if (!note) return reply.notFound()
      return note
    },
  )

  // PUT /medical-note/:id
  app.put<{
    Params: { id: string }
    Body: { authorId: string; text: string }
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
          required: ['authorId', 'text'],
          additionalProperties: false,
          properties: {
            authorId: { type: 'string', minLength: 1, maxLength: 255 },
            text: { type: 'string', minLength: 1, maxLength: 10000 },
          },
        },
        response: { 200: noteSchema },
      },
    },
    async (request, reply) => {
      try {
        const note = await createNoteVersion(
          request.params.id,
          request.body.authorId,
          request.body.text,
        )
        return note
      } catch (err) {
        if (err instanceof NoteNotFoundError) return reply.notFound()
        if (err instanceof NoteConflictError) return reply.conflict(err.message)
        throw err
      }
    },
  )
}
