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

