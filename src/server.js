const path = require('node:path');
const express = require('express');
const { db } = require('./db');
const { verifyPassword, signToken, verifyToken } = require('./auth');

const app = express();
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use((req, res, next) => {
  res.on('finish', () => console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode}`));
  next();
});

// ---------- Helpers ----------
const ROLES = ['admin', 'manager', 'employee'];

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const data = token && verifyToken(token);
  if (!data) return res.status(401).json({ error: 'não autenticado' });
  req.user = { id: data.sub, role: data.role };
  next();
}

function requireRole(...roles) {
  return (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'acesso negado' });
}

// Só admin/manager, ou o próprio funcionário, enxergam o salário.
function serializeEmployee(emp, viewer) {
  const canSeeSalary = viewer.role === 'admin' || viewer.role === 'manager' || viewer.id === emp.id;
  const out = {
    id: emp.id, name: emp.name, email: emp.email, role: emp.role,
    department: emp.department, title: emp.title, created_at: emp.created_at,
  };
  if (canSeeSalary) out.salary = emp.salary;
  return out;
}

const getEmployee = (id) => db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
const getProject = (id) => db.prepare('SELECT * FROM projects WHERE id = ?').get(id);

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'id inválido' }); return null; }
  return id;
}

// ---------- Auth ----------
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string')
    return res.status(400).json({ error: 'email e password são obrigatórios' });
  const emp = db.prepare('SELECT * FROM employees WHERE email = ?').get(email);
  if (!emp || !verifyPassword(password, emp.password_hash))
    return res.status(401).json({ error: 'credenciais inválidas' }); // mensagem genérica
  const token = signToken({ sub: emp.id, role: emp.role });
  res.json({ token, employee: serializeEmployee(emp, emp) });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const emp = getEmployee(req.user.id);
  if (!emp) return res.status(404).json({ error: 'funcionário não encontrado' });
  res.json(serializeEmployee(emp, req.user));
});

// ---------- Funcionários ----------
// Admin/manager veem todos; employee vê só a si mesmo.
app.get('/api/employees', authenticate, (req, res) => {
  const rows = req.user.role === 'employee'
    ? [getEmployee(req.user.id)].filter(Boolean)
    : db.prepare('SELECT * FROM employees ORDER BY id').all();
  res.json(rows.map((e) => serializeEmployee(e, req.user)));
});

app.get('/api/employees/:id', authenticate, (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  // Controle de acesso por objeto: employee só acessa o próprio registro.
  if (req.user.role === 'employee' && req.user.id !== id)
    return res.status(403).json({ error: 'acesso negado' });
  const emp = getEmployee(id);
  if (!emp) return res.status(404).json({ error: 'funcionário não encontrado' });
  res.json(serializeEmployee(emp, req.user));
});

app.post('/api/employees', authenticate, requireRole('admin'), (req, res) => {
  const { name, email, role = 'employee', department = '', title = '', salary = 0, password } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name obrigatório' });
  if (typeof email !== 'string' || !/.+@.+\..+/.test(email)) return res.status(400).json({ error: 'email inválido' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'role inválido' });
  if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'password com no mínimo 8 caracteres' });
  const { hashPassword } = require('./auth');
  try {
    const result = db.prepare(
      'INSERT INTO employees (name, email, role, department, title, salary, password_hash) VALUES (?,?,?,?,?,?,?)'
    ).run(name.trim(), email, role, department, title, Number(salary) || 0, hashPassword(password));
    res.status(201).json(serializeEmployee(getEmployee(result.lastInsertRowid), req.user));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'email já cadastrado' });
    throw e;
  }
});

// Admin edita tudo; o próprio funcionário edita só dados de perfil (NÃO role nem salary).
app.put('/api/employees/:id', authenticate, (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const emp = getEmployee(id);
  if (!emp) return res.status(404).json({ error: 'funcionário não encontrado' });
  const isAdmin = req.user.role === 'admin';
  const isSelf = req.user.id === id;
  if (!isAdmin && !isSelf) return res.status(403).json({ error: 'acesso negado' });

  const body = req.body || {};
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : emp.name;
  const department = typeof body.department === 'string' ? body.department : emp.department;
  const title = typeof body.title === 'string' ? body.title : emp.title;
  // Campos sensíveis só mudam se for admin — evita mass assignment / escalonamento.
  let role = emp.role, salary = emp.salary;
  if (isAdmin) {
    if (body.role !== undefined) { if (!ROLES.includes(body.role)) return res.status(400).json({ error: 'role inválido' }); role = body.role; }
    if (body.salary !== undefined) salary = Number(body.salary) || 0;
  }
  db.prepare('UPDATE employees SET name=?, department=?, title=?, role=?, salary=? WHERE id=?')
    .run(name, department, title, role, salary, id);
  res.json(serializeEmployee(getEmployee(id), req.user));
});

app.delete('/api/employees/:id', authenticate, requireRole('admin'), (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  if (id === req.user.id) return res.status(400).json({ error: 'não é possível excluir a si mesmo' });
  const changes = db.prepare('DELETE FROM employees WHERE id = ?').run(id).changes;
  if (!changes) return res.status(404).json({ error: 'funcionário não encontrado' });
  res.status(204).end();
});

// ---------- Projetos ----------
function serializeProject(p) {
  const members = db.prepare(
    `SELECT e.id, e.name, e.title FROM project_members m JOIN employees e ON e.id = m.employee_id
     WHERE m.project_id = ? ORDER BY e.name`
  ).all(p.id);
  const mgr = getEmployee(p.manager_id);
  return { ...p, manager: mgr ? { id: mgr.id, name: mgr.name } : null, members };
}

const canManageProject = (user, project) =>
  user.role === 'admin' || (user.role === 'manager' && project.manager_id === user.id);

app.get('/api/projects', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM projects ORDER BY id').all().map(serializeProject));
});

app.get('/api/projects/:id', authenticate, (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const p = getProject(id);
  if (!p) return res.status(404).json({ error: 'projeto não encontrado' });
  res.json(serializeProject(p));
});

app.post('/api/projects', authenticate, requireRole('admin', 'manager'), (req, res) => {
  const { name, description = '', status = 'planning', budget = 0, manager_id } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name obrigatório' });
  if (!['planning', 'active', 'done'].includes(status)) return res.status(400).json({ error: 'status inválido' });
  // Manager só cria projeto com ele mesmo como responsável.
  const mgrId = req.user.role === 'admin' && manager_id ? Number(manager_id) : req.user.id;
  if (!getEmployee(mgrId)) return res.status(400).json({ error: 'manager_id inválido' });
  const result = db.prepare(
    'INSERT INTO projects (name, description, status, budget, manager_id) VALUES (?,?,?,?,?)'
  ).run(name.trim(), String(description), status, Number(budget) || 0, mgrId);
  res.status(201).json(serializeProject(getProject(result.lastInsertRowid)));
});

app.put('/api/projects/:id', authenticate, (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const p = getProject(id);
  if (!p) return res.status(404).json({ error: 'projeto não encontrado' });
  if (!canManageProject(req.user, p)) return res.status(403).json({ error: 'acesso negado' });
  const b = req.body || {};
  const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim() : p.name;
  const description = typeof b.description === 'string' ? b.description : p.description;
  const status = ['planning', 'active', 'done'].includes(b.status) ? b.status : p.status;
  const budget = b.budget !== undefined ? Number(b.budget) || 0 : p.budget;
  db.prepare('UPDATE projects SET name=?, description=?, status=?, budget=? WHERE id=?')
    .run(name, description, status, budget, id);
  res.json(serializeProject(getProject(id)));
});

app.delete('/api/projects/:id', authenticate, (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const p = getProject(id);
  if (!p) return res.status(404).json({ error: 'projeto não encontrado' });
  if (!canManageProject(req.user, p)) return res.status(403).json({ error: 'acesso negado' });
  db.prepare('DELETE FROM project_members WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  res.status(204).end();
});

// ---------- Membros do projeto ----------
app.post('/api/projects/:id/members', authenticate, (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const p = getProject(id);
  if (!p) return res.status(404).json({ error: 'projeto não encontrado' });
  if (!canManageProject(req.user, p)) return res.status(403).json({ error: 'acesso negado' });
  const employeeId = Number(req.body?.employee_id);
  if (!getEmployee(employeeId)) return res.status(400).json({ error: 'employee_id inválido' });
  db.prepare('INSERT OR IGNORE INTO project_members (project_id, employee_id) VALUES (?,?)').run(id, employeeId);
  res.status(201).json(serializeProject(getProject(id)));
});

app.delete('/api/projects/:id/members/:employeeId', authenticate, (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const p = getProject(id);
  if (!p) return res.status(404).json({ error: 'projeto não encontrado' });
  if (!canManageProject(req.user, p)) return res.status(403).json({ error: 'acesso negado' });
  db.prepare('DELETE FROM project_members WHERE project_id = ? AND employee_id = ?')
    .run(id, Number(req.params.employeeId));
  res.status(204).end();
});

// ---------- 404 e erros ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'rota não encontrada' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON malformado' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'corpo muito grande' });
  console.error(err);
  res.status(500).json({ error: 'erro interno' });
});

const server = app.listen(PORT, HOST, () => console.log(`Servidor rodando em http://${HOST}:${PORT}`));
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`A porta ${PORT} já está em uso. Pare o outro servidor (Ctrl+C) ou use PORT=3001.`);
    console.error(`Para ver quem usa a porta: ss -ltnp | grep :${PORT}`);
  } else { console.error(err); }
  process.exit(1);
});
