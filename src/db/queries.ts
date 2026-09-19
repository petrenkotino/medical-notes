import { sql } from './pool.js'
import type { MedicalNote, AuditEntry } from '../types.js'

export class NoteNotFoundError extends Error {
  constructor(id: string) {
    super(`Note ${id} not found`)
    this.name = 'NoteNotFoundError'
  }
}

export class NoteConflictError extends Error {
  constructor(id: string) {
    super(`Concurrent version conflict on note ${id}, please retry`)
    this.name = 'NoteConflictError'
  }
}

export async function createNote(
  patientId: string,
  authorId: string,
  text: string,
): Promise<MedicalNote> {
  const [row] = await sql<MedicalNote[]>`
    INSERT INTO medical_notes (patient_id, author_id, text, version)
    VALUES (${patientId}, ${authorId}, ${text}, 1)
    RETURNING *
  `
  return row
}

export async function getLatestNote(id: string): Promise<MedicalNote | null> {
  const [row] = await sql<MedicalNote[]>`
    SELECT *
    FROM medical_notes
    WHERE id = ${id}::uuid
    ORDER BY version DESC
    LIMIT 1
  `
  return row ?? null
}

// CTE inserts the next version in a single atomic statement.
// Concurrent updates to the same note id may race and produce a PK violation (23505).
// We surface that as NoteConflictError → 409, measured separately from infra errors.
export async function createNoteVersion(
  id: string,
  authorId: string,
  text: string,
): Promise<MedicalNote> {
  try {
    const [row] = await sql<MedicalNote[]>`
      WITH latest AS (
        SELECT id, patient_id, version
        FROM medical_notes
        WHERE id = ${id}::uuid
        ORDER BY version DESC
        LIMIT 1
      )
      INSERT INTO medical_notes (id, patient_id, author_id, text, version)
      SELECT latest.id, latest.patient_id, ${authorId}, ${text}, latest.version + 1
      FROM latest
      RETURNING *
    `
    if (!row) throw new NoteNotFoundError(id)
    return row
  } catch (err) {
    if (isPostgresError(err) && err.code === '23505') throw new NoteConflictError(id)
    throw err
  }
}

function isPostgresError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && 'code' in err
}

export async function logAudit(
  entityId: string,
  action: AuditEntry['action'],
  actorId: string,
  details?: Record<string, string | number | boolean | null>,
): Promise<void> {
  await sql`
    INSERT INTO audit_log (entity_id, action, actor_id, details)
    VALUES (${entityId}::uuid, ${action}, ${actorId}, ${details ? sql.json(details) : null})
  `
}
