-- Money Tracker D1 schema
-- Column notes: `desc` and `group` are SQL reserved words, so the tables use
-- `descr` and `grp`; the API aliases them back to `desc`/`group` in JSON.

CREATE TABLE IF NOT EXISTS expenses (
  id     TEXT PRIMARY KEY,
  type   TEXT NOT NULL DEFAULT 'expense',
  descr  TEXT NOT NULL,
  amount REAL NOT NULL,
  cat    TEXT NOT NULL,
  grp    TEXT NOT NULL DEFAULT '',
  date   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS budgets (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  amount     REAL NOT NULL,
  cat        TEXT NOT NULL DEFAULT 'all',
  grp        TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fixed_costs (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  amount     REAL NOT NULL,
  cat        TEXT NOT NULL,
  grp        TEXT NOT NULL DEFAULT '',
  recurrence TEXT NOT NULL DEFAULT 'monthly',
  due_day    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
