-- Money Tracker D1 schema (multi-user)
-- `descr`/`grp` avoid the SQL reserved words desc/group; the API aliases them back.
-- Every data row carries user_id so each account sees only its own data.

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

CREATE TABLE IF NOT EXISTS expenses (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  type    TEXT NOT NULL DEFAULT 'expense',
  descr   TEXT NOT NULL,
  amount  REAL NOT NULL,
  cat     TEXT NOT NULL,
  grp     TEXT NOT NULL DEFAULT '',
  date    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  user_id TEXT NOT NULL DEFAULT '',
  name    TEXT NOT NULL,
  PRIMARY KEY (user_id, name)
);

CREATE TABLE IF NOT EXISTS budgets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL DEFAULT '',
  name       TEXT NOT NULL,
  amount     REAL NOT NULL,
  cat        TEXT NOT NULL DEFAULT 'all',
  grp        TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fixed_costs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL DEFAULT '',
  name       TEXT NOT NULL,
  amount     REAL NOT NULL,
  cat        TEXT NOT NULL,
  grp        TEXT NOT NULL DEFAULT '',
  recurrence TEXT NOT NULL DEFAULT 'monthly',
  due_day    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT NOT NULL DEFAULT '',
  key     TEXT NOT NULL,
  value   TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
