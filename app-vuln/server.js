const path = require('node:path');
const fs = require('node:fs');
const { exec } = require('node:child_process');
const express = require('express');
const { all, one, run, ENGINE } = require('./db');
const config = require('./config');

const app = express();
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('X-Powered-By', 'Express');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const makeToken = (emp) => Buffer.from(JSON.stringify({ sub: emp.id, role: emp.role })).toString('base64url');
function readToken(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return null;
  try { return JSON.parse(Buffer.from(t, 'base64url').toString()); } catch { return null; }
}
const authOptional = (req, res, next) => { req.user = readToken(req); next(); };

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) =>
  res.status(500).json({ error: e.message, stack: e.stack }));

// ---------- Auth ----------
app.get('/api/health', (req, res) => res.json({ status: 'ok', engine: ENGINE, region: config.aws.region }));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const sql = `SELECT * FROM employees WHERE email = '${email}' AND password = '${password}'`;
  try {
    const emp = await one(sql);
    if (!emp) return res.status(401).json({ error: 'credenciais inválidas', sql });
    res.json({ token: makeToken(emp), employee: emp });
  } catch (e) {
    res.status(500).json({ error: e.message, sql });
  }
}));

app.get('/api/auth/me', authOptional, wrap(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'não autenticado' });
  const emp = await one('SELECT * FROM employees WHERE id = ?', [req.user.sub]);
  res.json(emp);
}));

// ---------- Funcionários ----------
app.get('/api/employees', authOptional, wrap(async (req, res) => {
  let sql = 'SELECT * FROM employees';
  if (req.query.search) sql += ` WHERE name LIKE '%${req.query.search}%' OR bio LIKE '%${req.query.search}%'`;
  try { res.json(await all(sql)); }
  catch (e) { res.status(500).json({ error: e.message, sql }); }
}));

app.get('/api/employees/:id', wrap(async (req, res) => {
  const emp = await one(`SELECT * FROM employees WHERE id = ${req.params.id}`);
  if (!emp) return res.status(404).json({ error: 'não encontrado' });
  res.json(emp);
}));

app.put('/api/employees/:id', authOptional, wrap(async (req, res) => {
  const current = await one('SELECT * FROM employees WHERE id = ?', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'não encontrado' });
  for (const key of ['name', 'email', 'role', 'department', 'title', 'salary', 'bio', 'password']) {
    if (req.body[key] !== undefined) await run(`UPDATE employees SET ${key} = ? WHERE id = ?`, [req.body[key], req.params.id]);
  }
  res.json(await one('SELECT * FROM employees WHERE id = ?', [req.params.id]));
}));

app.delete('/api/employees/:id', authOptional, wrap(async (req, res) => {
  await run('DELETE FROM employees WHERE id = ?', [req.params.id]);
  res.status(204).end();
}));

// ---------- Projetos ----------
async function projectWithMembers(p) {
  return {
    ...p,
    manager: await one('SELECT id,name FROM employees WHERE id = ?', [p.manager_id]),
    members: await all(
      'SELECT e.id,e.name,e.title FROM project_members m JOIN employees e ON e.id=m.employee_id WHERE m.project_id = ?',
      [p.id]
    ),
  };
}
app.get('/api/projects', wrap(async (req, res) => {
  const rows = await all('SELECT * FROM projects ORDER BY id');
  res.json(await Promise.all(rows.map(projectWithMembers)));
}));
app.get('/api/projects/:id', wrap(async (req, res) => {
  const p = await one('SELECT * FROM projects WHERE id = ?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'não encontrado' });
  res.json(await projectWithMembers(p));
}));
app.post('/api/projects', wrap(async (req, res) => {
  const { name = '', description = '', status = 'planning', budget = 0, manager_id = 1 } = req.body || {};
  const r = await run('INSERT INTO projects (name,description,status,budget,manager_id) VALUES (?,?,?,?,?)',
    [name, description, status, budget, manager_id]);
  res.status(201).json(await projectWithMembers(await one('SELECT * FROM projects WHERE id = ?', [r.insertId])));
}));
app.put('/api/projects/:id', wrap(async (req, res) => {
  const p = await one('SELECT * FROM projects WHERE id = ?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'não encontrado' });
  const n = { ...p, ...req.body };
  await run('UPDATE projects SET name=?,description=?,status=?,budget=? WHERE id=?',
    [n.name, n.description, n.status, n.budget, req.params.id]);
  res.json(await projectWithMembers(await one('SELECT * FROM projects WHERE id = ?', [req.params.id])));
}));
app.delete('/api/projects/:id', wrap(async (req, res) => {
  await run('DELETE FROM projects WHERE id = ?', [req.params.id]);
  res.status(204).end();
}));

// ---------- Faturamento ----------
app.get('/api/billing/status', (req, res) =>
  res.json({ provider: 'stripe', configured: config.stripeSecretKey.startsWith('sk_live_') }));

// ---------- Ferramentas ----------
app.get('/api/tools/ping', (req, res) => {
  exec(`ping -c 1 ${req.query.host}`, { timeout: 5000 }, (err, stdout, stderr) =>
    res.type('text').send(stdout + stderr + (err ? `\n[erro] ${err.message}` : '')));
});

app.get('/api/files', (req, res) => {
  const base = path.join(__dirname, 'uploads');
  try { res.type('text').send(fs.readFileSync(path.join(base, String(req.query.name || '')), 'utf8')); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

app.get('/api/fetch-url', async (req, res) => {
  try { const r = await fetch(String(req.query.url)); res.type('text').send(await r.text()); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

const settings = {};
function deepMerge(t, s) {
  for (const k in s) {
    if (s[k] && typeof s[k] === 'object') { t[k] = t[k] || {}; deepMerge(t[k], s[k]); } else t[k] = s[k];
  }
  return t;
}
app.post('/api/settings', (req, res) => { deepMerge(settings, req.body); res.json({ ok: true, polluted: {}.isAdmin === true }); });

app.get('/go', (req, res) => res.redirect(String(req.query.to || '/')));

app.get('/search', (req, res) => {
  res.type('html').send(`<!doctype html><meta charset=utf-8><body>
    <h1>Resultados para: ${req.query.q || ''}</h1><a href="/">voltar</a></body>`);
});

app.use('/api', (req, res) => res.status(404).json({ error: 'rota não encontrada' }));
app.use((err, req, res, next) => res.status(500).json({ error: err.message, stack: err.stack }));

const server = app.listen(PORT, HOST, () => console.log(`Servidor em http://${HOST}:${PORT} (banco: ${ENGINE})`));
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`Porta ${PORT} em uso. Use PORT=3002.`);
  else console.error(err);
  process.exit(1);
});
