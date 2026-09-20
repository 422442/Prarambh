-- Tech Quiz Entrance — initial schema (docs/design.md §2)
-- Timestamps are unix seconds (INTEGER) unless noted.

CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  last_login_name TEXT,
  terms_version TEXT,
  terms_accepted_at INTEGER,
  camera_consent_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (correct_option IN ('A','B','C','D')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL UNIQUE REFERENCES participants(id),
  status TEXT NOT NULL CHECK (status IN ('in_progress','submitted')),
  submit_reason TEXT CHECK (submit_reason IN ('manual','time_up','violations','admin')),
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  submitted_at INTEGER,
  question_order TEXT NOT NULL,
  session_id TEXT NOT NULL,
  score REAL,
  correct_count INTEGER,
  wrong_count INTEGER,
  unanswered_count INTEGER,
  time_taken_seconds INTEGER,
  violation_count INTEGER NOT NULL DEFAULT 0,
  ip_address TEXT,
  user_agent TEXT
);

CREATE TABLE answers (
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  question_id TEXT NOT NULL REFERENCES questions(id),
  selected_option TEXT CHECK (selected_option IN ('A','B','C','D')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (attempt_id, question_id)
);

CREATE TABLE violations (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  type TEXT NOT NULL CHECK (type IN
    ('tab_switch','window_blur','fullscreen_exit','no_face',
     'multiple_faces','camera_lost','devtools','other')),
  occurred_at INTEGER NOT NULL,
  meta TEXT
);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  blob_url TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('periodic','violation')),
  face_count INTEGER,
  taken_at INTEGER NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE admin_audit (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE rate_limits (
  id TEXT PRIMARY KEY,
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_attempts_status ON attempts(status);
CREATE INDEX idx_attempts_ends ON attempts(ends_at);
CREATE INDEX idx_violations_attempt ON violations(attempt_id);
CREATE INDEX idx_snapshots_attempt ON snapshots(attempt_id);
CREATE INDEX idx_snapshots_taken ON snapshots(taken_at);
CREATE INDEX idx_questions_active ON questions(is_active);
