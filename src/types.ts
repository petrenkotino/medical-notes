export interface MedicalNote {
  id: string
  patientId: string
  authorId: string
  text: string
  version: number
  createdAt: Date
}
