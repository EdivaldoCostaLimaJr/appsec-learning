// Camada de dados (SQLite nativo do Node) para o sistema de gestão.
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./auth');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data.db');
const db = new DatabaseSync(DB_FILE);

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    role          TEXT    NOT NULL DEFAULT 'employee',  -- admin | manager | employee
    department    TEXT    NOT NULL DEFAULT '',
    title         TEXT    NOT NULL DEFAULT '',
    salary        INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    status      TEXT    NOT NULL DEFAULT 'planning',    -- planning | active | done
    budget      INTEGER NOT NULL DEFAULT 0,
    manager_id  INTEGER NOT NULL REFERENCES employees(id),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS project_members (
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, employee_id)
  );
`);

// -------- Seed inicial --------
const { count } = db.prepare('SELECT COUNT(*) AS count FROM employees').get();
if (count === 0) {
  const pw = hashPassword('Senha@123'); // senha padrão de todos (apenas para estudo)
  const insEmp = db.prepare(
    'INSERT INTO employees (name, email, role, department, title, salary, password_hash) VALUES (?,?,?,?,?,?,?)'
  );
  const emps = [
    ['Ana Souza', 'ana@empresa.com', 'admin', 'Diretoria', 'Diretora', 25000],
    ['Marcos Lima', 'marcos@empresa.com', 'manager', 'Engenharia', 'Gerente de Engenharia', 15000],
    ['Bruno Alves', 'bruno@empresa.com', 'employee', 'Engenharia', 'Desenvolvedor', 8000],
    ['Carla Dias', 'carla@empresa.com', 'employee', 'Design', 'Designer', 7000],
    ['Diego Melo', 'diego@empresa.com', 'employee', 'Engenharia', 'Desenvolvedor', 8500],
  ];
  const ids = emps.map((e) => insEmp.run(...e, pw).lastInsertRowid);

  const insProj = db.prepare(
    'INSERT INTO projects (name, description, status, budget, manager_id) VALUES (?,?,?,?,?)'
  );
  const p1 = insProj.run('Portal do Cliente', 'Novo portal de autoatendimento', 'active', 200000, ids[1]).lastInsertRowid;
  const p2 = insProj.run('App Mobile', 'Aplicativo iOS/Android', 'planning', 150000, ids[1]).lastInsertRowid;
  const p3 = insProj.run('Rebranding', 'Nova identidade visual', 'active', 80000, ids[0]).lastInsertRowid;

  const insMem = db.prepare('INSERT INTO project_members (project_id, employee_id) VALUES (?,?)');
  insMem.run(p1, ids[2]); insMem.run(p1, ids[4]);
  insMem.run(p2, ids[4]);
  insMem.run(p3, ids[3]);
}

module.exports = { db };
