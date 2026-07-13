// Money Tracker — Cloudflare Worker backend (D1), multi-user.
// Auth: username + password (PBKDF2-hashed), cookie sessions, shared signup code.
// Every data query is scoped to the logged-in user's id.

import HTML from '../../index.html';

/* ── helpers ── */

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json;charset=utf-8', ...headers },
  });

const notFound = detail => json({ detail }, 404);

const enc = new TextEncoder();
const toHex   = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = hex => new Uint8Array(hex.match(/.{2}/g).map(h => parseInt(h, 16)));

const PBKDF2_ITERS = 100000;

async function hashPassword(password, saltHex) {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key  = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' }, key, 256);
  return { hash: toHex(bits), salt: toHex(salt) };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.get('Cookie') || '';
  raw.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

const SESSION_DAYS = 30;
function sessionCookie(token) {
  const maxAge = SESSION_DAYS * 86400;
  return `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
const clearCookie = 'session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

async function getSessionUser(req, DB) {
  const token = parseCookies(req).session;
  if (!token) return null;
  const row = await DB.prepare(
    'SELECT u.id AS id, u.username AS username, s.expires_at AS expires_at ' +
    'FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').bind(token).first();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return { id: row.id, username: row.username };
}

async function newSession(DB, userId) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const expires = Date.now() + SESSION_DAYS * 86400 * 1000;
  await DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)')
    .bind(token, userId, expires).run();
  return token;
}

/* ── auth routes ── */

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;

async function signup(req, env) {
  const b = await req.json().catch(() => ({}));
  const username = (b.username || '').trim();
  const password = b.password || '';
  const code     = b.code || '';

  if (!env.SIGNUP_CODE)
    return json({ detail: 'Signup is disabled (no signup code configured).' }, 403);
  if (!timingSafeEqual(code, env.SIGNUP_CODE))
    return json({ detail: 'Wrong signup code.' }, 403);
  if (!USERNAME_RE.test(username))
    return json({ detail: 'Username must be 3-30 letters, numbers, . _ or -' }, 422);
  if (password.length < 6)
    return json({ detail: 'Password must be at least 6 characters.' }, 422);

  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first();
  if (exists) return json({ detail: 'That username is taken.' }, 409);

  const { hash, salt } = await hashPassword(password);
  const uid = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO users (id, username, pw_hash, pw_salt, created_at) VALUES (?,?,?,?,?)')
    .bind(uid, username, hash, salt, new Date().toISOString()).run();

  // First user ever claims any pre-existing (orphan) data from before multi-user.
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
  if (n === 1) {
    await env.DB.batch([
      env.DB.prepare("UPDATE expenses    SET user_id=? WHERE user_id=''").bind(uid),
      env.DB.prepare("UPDATE budgets     SET user_id=? WHERE user_id=''").bind(uid),
      env.DB.prepare("UPDATE fixed_costs SET user_id=? WHERE user_id=''").bind(uid),
      env.DB.prepare("UPDATE groups      SET user_id=? WHERE user_id=''").bind(uid),
      env.DB.prepare("UPDATE settings    SET user_id=? WHERE user_id=''").bind(uid),
    ]);
  }

  const token = await newSession(env.DB, uid);
  return json({ username }, 201, { 'Set-Cookie': sessionCookie(token) });
}

async function login(req, env) {
  const b = await req.json().catch(() => ({}));
  const username = (b.username || '').trim();
  const password = b.password || '';

  const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  if (!user) return json({ detail: 'Wrong username or password.' }, 401);

  const { hash } = await hashPassword(password, user.pw_salt);
  if (!timingSafeEqual(hash, user.pw_hash))
    return json({ detail: 'Wrong username or password.' }, 401);

  const token = await newSession(env.DB, user.id);
  return json({ username: user.username }, 200, { 'Set-Cookie': sessionCookie(token) });
}

async function logout(req, env) {
  const token = parseCookies(req).session;
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie });
}

/* ── data queries (scoped by user_id) ── */

const SEL = {
  expenses:    'SELECT id, type, descr AS "desc", amount, cat, grp AS "group", date FROM expenses WHERE user_id = ? ORDER BY date DESC, id DESC',
  budgets:     'SELECT id, name, amount, cat, grp AS "group", start_date, end_date FROM budgets WHERE user_id = ? ORDER BY id DESC',
  fixed_costs: 'SELECT id, name, amount, cat, grp AS "group", recurrence, due_day FROM fixed_costs WHERE user_id = ? ORDER BY id DESC',
};

const EXPORTS = {
  'expenses.csv':    { sql: SEL.expenses,    cols: ['id', 'type', 'desc', 'amount', 'cat', 'group', 'date'] },
  'groups.csv':      { sql: 'SELECT name FROM groups WHERE user_id = ? ORDER BY name', cols: ['name'] },
  'budgets.csv':     { sql: SEL.budgets,     cols: ['id', 'name', 'amount', 'cat', 'group', 'start_date', 'end_date'] },
  'fixed_costs.csv': { sql: SEL.fixed_costs, cols: ['id', 'name', 'amount', 'cat', 'group', 'recurrence', 'due_day'] },
};

function csvField(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(cols, rows) {
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map(c => csvField(r[c])).join(','));
  return lines.join('\n') + '\n';
}

/* ── data router (uid = authenticated user id) ── */

async function route(req, env, uid) {
  const url  = new URL(req.url);
  const path = url.pathname;
  const m    = req.method;
  const DB   = env.DB;

  /* expenses */
  if (path === '/api/expenses' && m === 'GET') {
    const { results } = await DB.prepare(SEL.expenses).bind(uid).all();
    return json(results);
  }
  if (path === '/api/expenses' && m === 'POST') {
    const b = await req.json();
    if (!b.desc || !(Number(b.amount) > 0) || !b.cat || !b.date)
      return json({ detail: 'desc, amount, cat and date are required' }, 422);
    const row = { id: Date.now().toString(), type: b.type || 'expense', desc: b.desc,
                  amount: Number(b.amount), cat: b.cat, group: b.group || '', date: b.date };
    await DB.prepare('INSERT INTO expenses (id, user_id, type, descr, amount, cat, grp, date) VALUES (?,?,?,?,?,?,?,?)')
      .bind(row.id, uid, row.type, row.desc, row.amount, row.cat, row.group, row.date).run();
    return json(row, 201);
  }
  let mm = path.match(/^\/api\/expenses\/([^/]+)$/);
  if (mm && m === 'DELETE') {
    const res = await DB.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?').bind(mm[1], uid).run();
    if (!res.meta.changes) return notFound('Expense not found');
    return json({ ok: true });
  }

  /* groups */
  if (path === '/api/groups' && m === 'GET') {
    const { results } = await DB.prepare('SELECT name FROM groups WHERE user_id = ? ORDER BY name').bind(uid).all();
    return json(results.map(r => r.name));
  }
  if (path === '/api/groups' && m === 'POST') {
    const b = await req.json();
    if (!b.name) return json({ detail: 'name is required' }, 422);
    const dup = await DB.prepare('SELECT 1 FROM groups WHERE user_id = ? AND name = ?').bind(uid, b.name).first();
    if (dup) return json({ detail: 'Group already exists' }, 409);
    await DB.prepare('INSERT INTO groups (user_id, name) VALUES (?,?)').bind(uid, b.name).run();
    return json({ name: b.name }, 201);
  }
  mm = path.match(/^\/api\/groups\/([^/]+)$/);
  if (mm && m === 'DELETE') {
    const name = decodeURIComponent(mm[1]);
    await DB.batch([
      DB.prepare("UPDATE expenses SET grp = '' WHERE grp = ? AND user_id = ?").bind(name, uid),
      DB.prepare('DELETE FROM groups WHERE user_id = ? AND name = ?').bind(uid, name),
    ]);
    return json({ ok: true });
  }

  /* budgets */
  if (path === '/api/budgets' && m === 'GET') {
    const { results } = await DB.prepare(SEL.budgets).bind(uid).all();
    return json(results);
  }
  if (path === '/api/budgets' && m === 'POST') {
    const b = await req.json();
    if (!b.name || !(Number(b.amount) > 0) || !b.start_date || !b.end_date)
      return json({ detail: 'name, amount, start_date and end_date are required' }, 422);
    const row = { id: Date.now().toString(), name: b.name, amount: Number(b.amount),
                  cat: b.cat || 'all', group: b.group || '', start_date: b.start_date, end_date: b.end_date };
    await DB.prepare('INSERT INTO budgets (id, user_id, name, amount, cat, grp, start_date, end_date) VALUES (?,?,?,?,?,?,?,?)')
      .bind(row.id, uid, row.name, row.amount, row.cat, row.group, row.start_date, row.end_date).run();
    return json(row, 201);
  }
  mm = path.match(/^\/api\/budgets\/([^/]+)$/);
  if (mm && m === 'PUT') {
    const b = await req.json();
    if (!b.name || !(Number(b.amount) > 0) || !b.start_date || !b.end_date)
      return json({ detail: 'name, amount, start_date and end_date are required' }, 422);
    const row = { id: mm[1], name: b.name, amount: Number(b.amount),
                  cat: b.cat || 'all', group: b.group || '', start_date: b.start_date, end_date: b.end_date };
    const res = await DB.prepare('UPDATE budgets SET name=?, amount=?, cat=?, grp=?, start_date=?, end_date=? WHERE id=? AND user_id=?')
      .bind(row.name, row.amount, row.cat, row.group, row.start_date, row.end_date, row.id, uid).run();
    if (!res.meta.changes) return notFound('Budget not found');
    return json(row);
  }
  if (mm && m === 'DELETE') {
    const res = await DB.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').bind(mm[1], uid).run();
    if (!res.meta.changes) return notFound('Budget not found');
    return json({ ok: true });
  }

  /* fixed costs */
  if (path === '/api/fixed-costs' && m === 'GET') {
    const { results } = await DB.prepare(SEL.fixed_costs).bind(uid).all();
    return json(results);
  }
  if (path === '/api/fixed-costs' && m === 'POST') {
    const b = await req.json();
    if (!b.name || !(Number(b.amount) > 0) || !b.cat)
      return json({ detail: 'name, amount and cat are required' }, 422);
    const row = { id: Date.now().toString(), name: b.name, amount: Number(b.amount), cat: b.cat,
                  group: b.group || '', recurrence: b.recurrence || 'monthly', due_day: b.due_day || '' };
    await DB.prepare('INSERT INTO fixed_costs (id, user_id, name, amount, cat, grp, recurrence, due_day) VALUES (?,?,?,?,?,?,?,?)')
      .bind(row.id, uid, row.name, row.amount, row.cat, row.group, row.recurrence, row.due_day).run();
    return json(row, 201);
  }
  mm = path.match(/^\/api\/fixed-costs\/([^/]+)$/);
  if (mm && m === 'DELETE') {
    const res = await DB.prepare('DELETE FROM fixed_costs WHERE id = ? AND user_id = ?').bind(mm[1], uid).run();
    if (!res.meta.changes) return notFound('Fixed cost not found');
    return json({ ok: true });
  }

  /* settings */
  if (path === '/api/settings' && m === 'GET') {
    const r = await DB.prepare("SELECT value FROM settings WHERE user_id = ? AND key = 'cycle_start_day'").bind(uid).first();
    return json({ cycle_start_day: r ? parseInt(r.value) : 1 });
  }
  if (path === '/api/settings' && m === 'PUT') {
    const b   = await req.json();
    const day = Math.min(Math.max(parseInt(b.cycle_start_day) || 1, 1), 31);
    await DB.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, 'cycle_start_day', ?)")
      .bind(uid, String(day)).run();
    return json({ cycle_start_day: day });
  }

  /* CSV export */
  mm = path.match(/^\/api\/export\/([\w.]+)$/);
  if (mm && m === 'GET') {
    const spec = EXPORTS[mm[1]];
    if (!spec) return notFound('Unknown export');
    const { results } = await DB.prepare(spec.sql).bind(uid).all();
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
    const url  = new URL(req.url);
    const path = url.pathname;
    const m    = req.method;
    try {
      // Public: the page shell and the auth endpoints
      if (path === '/' && m === 'GET')
        return new Response(HTML, { headers: { 'content-type': 'text/html;charset=utf-8' } });
      if (path === '/api/signup' && m === 'POST') return signup(req, env);
      if (path === '/api/login'  && m === 'POST') return login(req, env);
      if (path === '/api/logout' && m === 'POST') return logout(req, env);

      // Everything else needs a valid session
      const user = await getSessionUser(req, env.DB);
      if (path === '/api/me')
        return user ? json({ username: user.username }) : json({ detail: 'Not logged in' }, 401);
      if (!user) return json({ detail: 'Not logged in' }, 401);

      return await route(req, env, user.id);
    } catch (e) {
      return json({ detail: String(e) }, 500);
    }
  },
};
