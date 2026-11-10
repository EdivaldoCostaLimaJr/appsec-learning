// Camada de dados. Motor via DB_ENGINE: sqlite (padrão) ou mysql.
// API assíncrona: all(sql,params) / one(sql,params) / run(sql,params).
const path = require('node:path');

const ENGINE = (process.env.DB_ENGINE || 'sqlite').toLowerCase();
let all, one, run;

if (ENGINE === 'mysql') {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'corp',
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: true,
  });
  all = async (sql, p = []) => (await pool.query(sql, p))[0];
  one = async (sql, p = []) => (await pool.query(sql, p))[0][0] ?? null;
  run = async (sql, p = []) => {
    const [r] = await pool.query(sql, p);
    return { insertId: r.insertId, affectedRows: r.affectedRows };
  };
} else {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(process.env.DB_FILE || path.join(__dirname, 'data-vuln.db'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'employee', department TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '', salary INTEGER NOT NULL DEFAULT 0,
      bio TEXT NOT NULL DEFAULT '', password TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planning', budget INTEGER NOT NULL DEFAULT 0,
      manager_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER NOT NULL, employee_id INTEGER NOT NULL, PRIMARY KEY (project_id, employee_id));
  `);
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM employees').get();
  if (count === 0) {
    const insE = db.prepare('INSERT INTO employees (name,email,role,department,title,salary,bio,password) VALUES (?,?,?,?,?,?,?,?)');
    const emps = [
      ['Ana Souza', 'ana@empresa.com', 'admin', 'Diretoria', 'Diretora', 25000, 'Fundadora da empresa.'],
      ['Marcos Lima', 'marcos@empresa.com', 'manager', 'Engenharia', 'Gerente de Engenharia', 15000, ''],
      ['Bruno Alves', 'bruno@empresa.com', 'employee', 'Engenharia', 'Desenvolvedor', 8000, ''],
      ['Carla Dias', 'carla@empresa.com', 'employee', 'Design', 'Designer', 7000, ''],
      ['Diego Melo', 'diego@empresa.com', 'employee', 'Engenharia', 'Desenvolvedor', 8500, ''],
    ];
    const ids = emps.map((e) => insE.run(...e, 'Senha@123').lastInsertRowid);
    const insP = db.prepare('INSERT INTO projects (name,description,status,budget,manager_id) VALUES (?,?,?,?,?)');
    const p1 = insP.run('Portal do Cliente', 'Novo portal de autoatendimento', 'active', 200000, ids[1]).lastInsertRowid;
    const p2 = insP.run('App Mobile', 'Aplicativo iOS/Android', 'planning', 150000, ids[1]).lastInsertRowid;
    const p3 = insP.run('Rebranding', 'Nova identidade visual', 'active', 80000, ids[0]).lastInsertRowid;
    const insM = db.prepare('INSERT INTO project_members (project_id,employee_id) VALUES (?,?)');
    insM.run(p1, ids[2]); insM.run(p1, ids[4]); insM.run(p2, ids[4]); insM.run(p3, ids[3]);
  }
  all = async (sql, p = []) => db.prepare(sql).all(...p);
  one = async (sql, p = []) => db.prepare(sql).get(...p) ?? null;
  run = async (sql, p = []) => {
    const r = db.prepare(sql).run(...p);
    return { insertId: Number(r.lastInsertRowid), affectedRows: r.changes };
  };
}

module.exports = { all, one, run, ENGINE };
