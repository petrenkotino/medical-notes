import postgres from 'postgres'
import { readFileSync } from 'fs'
import { join } from 'path'

export const sql = postgres(process.env.DATABASE_URL!, {
  max: parseInt(process.env.DB_POOL_MAX ?? '40'),
  transform: postgres.camel,
  connection: {
    application_name: 'medical-notes-api',
  },
})

export async function runMigration(): Promise<void> {
  const migration = readFileSync(
    join(__dirname, 'migrations', '001_create_tables.sql'),
    'utf-8'
  )
  await sql.unsafe(migration)
}
