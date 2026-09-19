-- Medical notes: append-only, versioned
CREATE TABLE IF NOT EXISTS medical_notes (
  id            UUID NOT NULL DEFAULT gen_random_uuid(),
  patient_id    TEXT NOT NULL,
  author_id     TEXT NOT NULL,
  text          TEXT NOT NULL,
  version       INT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);

-- Audit log: append-only, never deleted
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id     UUID NOT NULL,
  entity_type   TEXT NOT NULL DEFAULT 'medical_note',
  action        TEXT NOT NULL CHECK (action IN ('created', 'updated', 'accessed')),
  actor_id      TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  details       JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity_id ON audit_log (entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_occurred_at ON audit_log (occurred_at);
