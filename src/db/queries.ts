import { sql } from './pool.js'
import type { MedicalNote, AuditEntry } from '../types.js'

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
// The PRIMARY KEY (id, version) acts as a safety net under concurrent writes:
// if two requests race on the same id, one will get a PK violation rather than
// silently overwriting. For a further guarantee, wrap in sql.begin() with FOR UPDATE.
export async function createNoteVersion(
  id: string,
  authorId: string,
  text: string,
): Promise<MedicalNote> {
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
  if (!row) throw new Error(`Note ${id} not found`)
  return row
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
