// Money Tracker — Cloudflare Worker backend (D1 database).
// Mirrors the FastAPI backend in ../../main.py: same routes, same JSON shapes,
// so ../../index.html works unchanged against either backend.

import HTML from '../../index.html';

/* ── helpers ── */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json;charset=utf-8' },
  });

const notFound = detail => json({ detail }, 404);

function checkAuth(req, password) {
  const header = req.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = atob(header.slice(6));
    const pass = decoded.slice(decoded.indexOf(':') + 1); // username is ignored
    return pass === password;
  } catch {
    return false;
  }
}

function csvField(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(cols, rows) {
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map(c => csvField(r[c])).join(','));
  return lines.join('\n') + '\n';
}

/* ── queries (aliases restore the JSON names the frontend expects) ── */

const SEL = {
  expenses:    'SELECT id, type, descr AS "desc", amount, cat, grp AS "group", date FROM expenses ORDER BY date DESC, id DESC',
  budgets:     'SELECT id, name, amount, cat, grp AS "group", start_date, end_date FROM budgets ORDER BY id DESC',
  fixed_costs: 'SELECT id, name, amount, cat, grp AS "group", recurrence, due_day FROM fixed_costs ORDER BY id DESC',
};

const EXPORTS = {
  'expenses.csv':    { sql: SEL.expenses,    cols: ['id', 'type', 'desc', 'amount', 'cat', 'group', 'date'] },
  'groups.csv':      { sql: 'SELECT name FROM groups ORDER BY rowid', cols: ['name'] },
  'budgets.csv':     { sql: SEL.budgets,     cols: ['id', 'name', 'amount', 'cat', 'group', 'start_date', 'end_date'] },
  'fixed_costs.csv': { sql: SEL.fixed_costs, cols: ['id', 'name', 'amount', 'cat', 'group', 'recurrence', 'due_day'] },
};

/* ── router ── */

async function route(req, env) {
  const url  = new URL(req.url);
  const path = url.pathname;
  const m    = req.method;
  const DB   = env.DB;

  // page
  if (path === '/' && m === 'GET')
    return new Response(HTML, { headers: { 'content-type': 'text/html;charset=utf-8' } });

  /* expenses */
  if (path === '/api/expenses' && m === 'GET') {
    const { results } = await DB.prepare(SEL.expenses).all();
    return json(results);
  }
  if (path === '/api/expenses' && m === 'POST') {
    const b = await req.json();
    if (!b.desc || !(Number(b.amount) > 0) || !b.cat || !b.date)
      return json({ detail: 'desc, amount, cat and date are required' }, 422);
    const row = {
      id:     Date.now().toString(),
      type:   b.type || 'expense',
      desc:   b.desc,
      amount: Number(b.amount),
      cat:    b.cat,
      group:  b.group || '',
      date:   b.date,
    };
    await DB.prepare('INSERT INTO expenses (id, type, descr, amount, cat, grp, date) VALUES (?,?,?,?,?,?,?)')
      .bind(row.id, row.type, row.desc, row.amount, row.cat, row.group, row.date).run();
    return json(row, 201);
  }
  let mm = path.match(/^\/api\/expenses\/([^/]+)$/);
  if (mm && m === 'DELETE') {
    const res = await DB.prepare('DELETE FROM expenses WHERE id = ?').bind(mm[1]).run();
    if (!res.meta.changes) return notFound('Expense not found');
    return json({ ok: true });
  }

  /* groups */
  if (path === '/api/groups' && m === 'GET') {
    const { results } = await DB.prepare('SELECT name FROM groups ORDER BY rowid').all();
    return json(results.map(r => r.name));
  }
  if (path === '/api/groups' && m === 'POST') {
    const b = await req.json();
    if (!b.name) return json({ detail: 'name is required' }, 422);
    const dup = await DB.prepare('SELECT 1 FROM groups WHERE name = ?').bind(b.name).first();
    if (dup) return json({ detail: 'Group already exists' }, 409);
    await DB.prepare('INSERT INTO groups (name) VALUES (?)').bind(b.name).run();
    return json({ name: b.name }, 201);
  }
  mm = path.match(/^\/api\/groups\/([^/]+)$/);
  if (mm && m === 'DELETE') {
    const name = decodeURIComponent(mm[1]);
    await DB.batch([
      DB.prepare("UPDATE expenses SET grp = '' WHERE grp = ?").bind(name),
      DB.prepare('DELETE FROM groups WHERE name = ?').bind(name),
    ]);
    return json({ ok: true });
  }

  /* budgets */
  if (path === '/api/budgets' && m === 'GET') {
    const { results } = await DB.prepare(SEL.budgets).all();
    return json(results);
  }
  if (path === '/api/budgets' && m === 'POST') {
    const b = await req.json();
    if (!b.name || !(Number(b.amount) > 0) || !b.start_date || !b.end_date)
      return json({ detail: 'name, amount, start_date and end_date are required' }, 422);
    const row = {
      id:         Date.now().toString(),
      name:       b.name,
      amount:     Number(b.amount),
      cat:        b.cat || 'all',
      group:      b.group || '',
      start_date: b.start_date,
      end_date:   b.end_date,
    };
    await DB.prepare('INSERT INTO budgets (id, name, amount, cat, grp, start_date, end_date) VALUES (?,?,?,?,?,?,?)')
      .bind(row.id, row.name, row.amount, row.cat, row.group, row.start_date, row.end_date).run();
    return json(row, 201);
  }
  mm = path.match(/^\/api\/budgets\/([^/]+)$/);
  if (mm && m === 'DELETE') {
    const res = await DB.prepare('DELETE FROM budgets WHERE id = ?').bind(mm[1]).run();
    if (!res.meta.changes) return notFound('Budget not found');
    return json({ ok: true });
  }

  /* fixed costs */
  if (path === '/api/fixed-costs' && m === 'GET') {
    const { results } = await DB.prepare(SEL.fixed_costs).all();
    return json(results);
  }
  if (path === '/api/fixed-costs' && m === 'POST') {
    const b = await req.json();
    if (!b.name || !(Number(b.amount) > 0) || !b.cat)
      return json({ detail: 'name, amount and cat are required' }, 422);
    const row = {
      id:         Date.now().toString(),
      name:       b.name,
      amount:     Number(b.amount),
      cat:        b.cat,
      group:      b.group || '',
      recurrence: b.recurrence || 'monthly',
      due_day:    b.due_day || '',
    };
    await DB.prepare('INSERT INTO fixed_costs (id, name, amount, cat, grp, recurrence, due_day) VALUES (?,?,?,?,?,?,?)')
      .bind(row.id, row.name, row.amount, row.cat, row.group, row.recurrence, row.due_day).run();
    return json(row, 201);
  }
  mm = path.match(/^\/api\/fixed-costs\/([^/]+)$/);
  if (mm && m === 'DELETE') {
    const res = await DB.prepare('DELETE FROM fixed_costs WHERE id = ?').bind(mm[1]).run();
    if (!res.meta.changes) return notFound('Fixed cost not found');
    return json({ ok: true });
  }

  /* settings */
  if (path === '/api/settings' && m === 'GET') {
    const r = await DB.prepare("SELECT value FROM settings WHERE key = 'cycle_start_day'").first();
    return json({ cycle_start_day: r ? parseInt(r.value) : 1 });
  }
  if (path === '/api/settings' && m === 'PUT') {
    const b   = await req.json();
    const day = Math.min(Math.max(parseInt(b.cycle_start_day) || 1, 1), 28);
    await DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cycle_start_day', ?)")
      .bind(String(day)).run();
    return json({ cycle_start_day: day });
  }

  /* CSV export */
  mm = path.match(/^\/api\/export\/([\w.]+)$/);
  if (mm && m === 'GET') {
    const spec = EXPORTS[mm[1]];
    if (!spec) return notFound('Unknown export');
    const { results } = await DB.prepare(spec.sql).all();
    return new Response(toCsv(spec.cols, results), {
      headers: {
        'content-type': 'text/csv;charset=utf-8',
        'content-disposition': `attachment; filename="${mm[1]}"`,
      },
    });
  }

  return notFound('Not found');
}

export default {
  async fetch(req, env) {
    if (!env.MONEY_PASSWORD)
      return new Response('Server not configured. Run: npx wrangler secret put MONEY_PASSWORD', { status: 503 });
    if (!checkAuth(req, env.MONEY_PASSWORD))
      return new Response('Login required', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Money Tracker"' },
      });
    try {
      return await route(req, env);
    } catch (e) {
      return json({ detail: String(e) }, 500);
    }
  },
};
