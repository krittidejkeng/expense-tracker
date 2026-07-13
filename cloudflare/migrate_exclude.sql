-- Add the per-expense "don't count in totals" flag to an existing database.
-- Existing rows default to 0 (counted), so nothing changes for current data.
ALTER TABLE expenses ADD COLUMN exclude_totals INTEGER NOT NULL DEFAULT 0;
