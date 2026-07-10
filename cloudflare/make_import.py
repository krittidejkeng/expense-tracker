#!/usr/bin/env python3
"""Generate import_data.sql from the local data/ CSV files.

Run from the cloudflare/ directory (or anywhere):
    python3 make_import.py
Then load it into D1:
    npx wrangler d1 execute money-tracker --remote --file=import_data.sql

import_data.sql contains personal data — it is gitignored; never commit it.
"""
import csv, json, os

BASE = os.path.join(os.path.dirname(__file__), '..', 'data')
OUT  = os.path.join(os.path.dirname(__file__), 'import_data.sql')

def q(s):  # SQL single-quote escape
    return "'" + str(s).replace("'", "''") + "'"

def rows(name):
    path = os.path.join(BASE, name)
    if not os.path.exists(path):
        return []
    with open(path, newline='') as f:
        return list(csv.DictReader(f))

stmts = []

for r in rows('expenses.csv'):
    stmts.append(
        f"INSERT OR REPLACE INTO expenses (id, type, descr, amount, cat, grp, date) VALUES "
        f"({q(r['id'])}, {q(r.get('type') or 'expense')}, {q(r['desc'])}, {float(r['amount'])}, "
        f"{q(r['cat'])}, {q(r.get('group') or '')}, {q(r['date'])});"
    )

for r in rows('groups.csv'):
    stmts.append(f"INSERT OR REPLACE INTO groups (name) VALUES ({q(r['name'])});")

for r in rows('budgets.csv'):
    stmts.append(
        f"INSERT OR REPLACE INTO budgets (id, name, amount, cat, grp, start_date, end_date) VALUES "
        f"({q(r['id'])}, {q(r['name'])}, {float(r['amount'])}, {q(r.get('cat') or 'all')}, "
        f"{q(r.get('group') or '')}, {q(r['start_date'])}, {q(r['end_date'])});"
    )

for r in rows('fixed_costs.csv'):
    stmts.append(
        f"INSERT OR REPLACE INTO fixed_costs (id, name, amount, cat, grp, recurrence, due_day) VALUES "
        f"({q(r['id'])}, {q(r['name'])}, {float(r['amount'])}, {q(r['cat'])}, "
        f"{q(r.get('group') or '')}, {q(r.get('recurrence') or 'monthly')}, {q(r.get('due_day') or '')});"
    )

settings_path = os.path.join(BASE, 'settings.json')
if os.path.exists(settings_path):
    with open(settings_path) as f:
        day = json.load(f).get('cycle_start_day', 1)
    stmts.append(f"INSERT OR REPLACE INTO settings (key, value) VALUES ('cycle_start_day', {q(day)});")

with open(OUT, 'w') as f:
    f.write('\n'.join(stmts) + '\n')

print(f"Wrote {len(stmts)} statements to {OUT}")
