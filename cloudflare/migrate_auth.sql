-- One-time migration: add multi-user auth to an existing (single-user) database.
-- Existing rows get user_id='' (orphan); the FIRST signup claims them.
-- Safe to run once. groups/settings are recreated to add user_id to their keys.

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  username   TEXT UNIQUE NOT NULL,
  pw_hash    TEXT NOT NULL,
  pw_salt    TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

ALTER TABLE expenses    ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE budgets     ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE fixed_costs ADD COLUMN user_id TEXT NOT NULL DEFAULT '';

-- groups: rebuild with composite (user_id, name) key
CREATE TABLE groups_new (
  user_id TEXT NOT NULL DEFAULT '',
  name    TEXT NOT NULL,
  PRIMARY KEY (user_id, name)
);
INSERT INTO groups_new (user_id, name) SELECT '', name FROM groups;
DROP TABLE groups;
ALTER TABLE groups_new RENAME TO groups;

-- settings: rebuild with composite (user_id, key) key
CREATE TABLE settings_new (
  user_id TEXT NOT NULL DEFAULT '',
  key     TEXT NOT NULL,
  value   TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);
INSERT INTO settings_new (user_id, key, value) SELECT '', key, value FROM settings;
DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;

CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
