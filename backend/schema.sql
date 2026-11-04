-- Applied on every boot, so each statement must be idempotent.

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
  department    TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  employee_id   TEXT NOT NULL DEFAULT '',
  roll_no       TEXT NOT NULL DEFAULT '',
  year          TEXT NOT NULL DEFAULT '',
  division      TEXT NOT NULL DEFAULT '',
  semester      TEXT NOT NULL DEFAULT '',
  -- Biometric data: a numeric face template, never a photo. Never select this into an API response.
  face_embedding   REAL[],
  face_enrolled_at TIMESTAMPTZ,
  face_consent_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS classes (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  subject    TEXT NOT NULL DEFAULT '',
  join_code  TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS classes_teacher ON classes(teacher_id);

CREATE TABLE IF NOT EXISTS enrollments (
  class_id   BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, student_id)
);
CREATE INDEX IF NOT EXISTS enrollments_student ON enrollments(student_id);

CREATE TABLE IF NOT EXISTS sessions (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id   BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  topic      TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sessions_class ON sessions(class_id, started_at DESC);
-- A class can only have one session running at a time.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_session ON sessions(class_id) WHERE ended_at IS NULL;

-- A row means present. Absent is derived: enrolled before the session started, with no row here.
CREATE TABLE IF NOT EXISTS attendance (
  session_id BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  marked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  method     TEXT NOT NULL CHECK (method IN ('face', 'manual')),
  similarity REAL,
  PRIMARY KEY (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS attendance_student ON attendance(student_id);
