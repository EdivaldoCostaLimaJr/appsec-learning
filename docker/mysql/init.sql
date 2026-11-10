-- Schema + seed do banco MySQL (executado pelo contêiner na 1ª subida).
CREATE DATABASE IF NOT EXISTS corp;
USE corp;

CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(32) NOT NULL DEFAULT 'employee',
  department VARCHAR(255) NOT NULL DEFAULT '',
  title VARCHAR(255) NOT NULL DEFAULT '',
  salary INT NOT NULL DEFAULT 0,
  bio TEXT,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'planning',
  budget INT NOT NULL DEFAULT 0,
  manager_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id INT NOT NULL,
  employee_id INT NOT NULL,
  PRIMARY KEY (project_id, employee_id)
);

INSERT INTO employees (name,email,role,department,title,salary,bio,password) VALUES
  ('Ana Souza','ana@empresa.com','admin','Diretoria','Diretora',25000,'Fundadora da empresa.','Senha@123'),
  ('Marcos Lima','marcos@empresa.com','manager','Engenharia','Gerente de Engenharia',15000,'','Senha@123'),
  ('Bruno Alves','bruno@empresa.com','employee','Engenharia','Desenvolvedor',8000,'','Senha@123'),
  ('Carla Dias','carla@empresa.com','employee','Design','Designer',7000,'','Senha@123'),
  ('Diego Melo','diego@empresa.com','employee','Engenharia','Desenvolvedor',8500,'','Senha@123');

INSERT INTO projects (name,description,status,budget,manager_id) VALUES
  ('Portal do Cliente','Novo portal de autoatendimento','active',200000,2),
  ('App Mobile','Aplicativo iOS/Android','planning',150000,2),
  ('Rebranding','Nova identidade visual','active',80000,1);

INSERT INTO project_members (project_id,employee_id) VALUES (1,3),(1,5),(2,5),(3,4);

CREATE USER IF NOT EXISTS 'app'@'%' IDENTIFIED BY 'app123';
GRANT ALL PRIVILEGES ON *.* TO 'app'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
