export interface MedicalNote {
  id: string
  patientId: string
  authorId: string
  text: string
  version: number
  createdAt: Date
}

export interface AuditEntry {
  id: string
  entityId: string
  entityType: string
  action: 'created' | 'updated' | 'accessed'
  actorId: string
  occurredAt: Date
  details: Record<string, string | number | boolean | null> | null
}
