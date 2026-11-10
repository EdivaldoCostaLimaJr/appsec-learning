# appsec-learning

Laboratório de estudo de **AppSec** com foco em **segurança da cadeia de suprimentos (supply chain)**: gerar/validar **SBOM** e verificar dependências com apoio de **IA na pipeline** — detectando libs vulneráveis, maliciosas, *typosquatting* e nomes de pacote "alucinados" por IA (*slopsquatting*).

Para ter um alvo realista, o repositório traz um **sistema de gestão de projetos e funcionários** em duas versões:

- **`src/` — versão segura (baseline):** mesma funcionalidade, implementada com boas práticas. Serve de referência de comparação.
- **`app-vuln/` — versão vulnerável:** cópia com **18 vulnerabilidades injetadas de propósito** (OWASP Web + API, do clássico ao moderno).

E um conjunto de **dependências ruins** em `fixtures/deps/` (CVE real, typosquatting, alucinadas e um pacote malicioso simulado) para a futura pipeline de detecção analisar.

> ⚠️ **A `app-vuln/` é intencionalmente insegura** (inclui command injection e leitura de arquivos). Rode **somente em ambiente local**, nunca exposta à internet.

## Requisitos
- Node.js 22.13+

## Como rodar
```bash
npm install

npm start            # versão SEGURA  -> http://localhost:3000
npm run vuln         # versão VULNERÁVEL (banco SQLite) -> http://localhost:3001
# no WSL2 com navegador no Windows, use: npm run start:wsl  /  npm run vuln:wsl
```

A `app-vuln` suporta dois bancos: **SQLite** (padrão, `npm run vuln`, sem Docker) e **MySQL** (`DB_ENGINE=mysql`, usado no superlab abaixo).

### Superlab em Docker (web + banco separados)
```bash
docker compose up --build
# web (Node):  http://127.0.0.1:3001      banco (MySQL): 127.0.0.1:3306
```
Os contêineres são **intencionalmente inseguros** para estudar exploração de container (socket do Docker montado, container privilegiado, banco exposto, segredos na imagem). Lista completa e cadeias de exploração em [`docker/CONTAINER-SECURITY.md`](docker/CONTAINER-SECURITY.md).

| # | Misconfig de container | Onde |
|---|---|---|
| C4 | Processo roda como **root** | `app-vuln/Dockerfile` |
| C2/C3 | Segredos em build-arg e `COPY . .` (vaza `.env`, `secret-config.txt`) | `Dockerfile` |
| C7/C9 | Banco MySQL exposto e app usando usuário **root** | `docker-compose.yml` |
| C10 | Container **privilegiado** | `docker-compose.yml` |
| C11 | `/var/run/docker.sock` montado → **takeover do host** | `docker-compose.yml` |

Encadeamento típico: **V9 (command injection) → shell root no container → V10/C3 vaza segredos → C11 escapa para o host**.

### Infraestrutura como código (Terraform / AWS)
`terraform/` traz IaC AWS **intencionalmente insegura** para os scanners de IaC. Análise estática, sem credenciais nem `apply`:
```bash
trivy config terraform/      # também: checkov -d terraform/  |  tfsec terraform/
```
Dispara dezenas de achados (CRITICAL/HIGH): S3 público sem criptografia, security group `0.0.0.0/0`, RDS exposto, IAM `*:*`, IMDSv1, credenciais hardcoded. Gabarito em [`terraform/IAC-SECURITY.md`](terraform/IAC-SECURITY.md).

**Contas de teste** (ambas as apps), senha `Senha@123`:

| E-mail | Cargo |
|---|---|
| ana@empresa.com | admin |
| marcos@empresa.com | manager |
| bruno@empresa.com | employee |

## Estrutura
```
src/               app SEGURA (server.js, auth.js, db.js)
public/            interface da app segura
app-vuln/          app VULNERÁVEL (server.js, db.js, Dockerfile, public/, VULNERABILITIES.md)
fixtures/deps/     dependências ruins (dados para a pipeline analisar)
services/python/   microserviço Flask vulnerável (SAST/SCA poliglota)
services/java/     microserviço Java vulnerável (Log4Shell, SQLi, cmd injection)
terraform/         IaC AWS vulnerável + IAC-SECURITY.md (para scan de IaC)
docker-compose.yml stack do superlab (web + db)
docker/            init do MySQL + CONTAINER-SECURITY.md (vulns de container)
.env               segredos falsos (demonstra o anti-padrão de versionar segredos)
```

## Linguagens (para análise poliglota)
O código principal (apps segura e vulnerável) é **Node.js / JavaScript**. Para que as análises não cubram uma linguagem só, há dois microserviços com rotas vulneráveis equivalentes:

| Serviço | Stack | Falhas / insumos para scan |
|---|---|---|
| `services/python/` | Flask | SQLi (`/api/reports`), command injection (`/api/export`), SSRF (`/api/fetch`), segredos hardcoded, `requirements.txt` com libs antigas (Flask 0.12, requests 2.19) |
| `services/java/` | JDK HttpServer + Maven | SQLi JDBC (`/api/reports`), command injection (`/api/export`), log4j (`pom.xml` com **log4j 2.14.1 / Log4Shell**), segredos hardcoded |

São alvos de SAST (semgrep) e SCA/SBOM (trivy, osv-scanner); não precisam compilar/rodar para serem analisados. Para rodar: Python `pip install -r services/python/requirements.txt && python services/python/app.py` (porta 5000); Java `mvn -f services/java compile` (precisa de Maven).

---

## Vulnerabilidades injetadas (app-vuln)

Base da API vulnerável: `http://127.0.0.1:3001`. Cada falha está marcada no código com `// VULN`. Detalhes e correções em [`app-vuln/VULNERABILITIES.md`](app-vuln/VULNERABILITIES.md).

| # | Vulnerabilidade | OWASP | Onde (rota / arquivo) | Payload de teste |
|---|---|---|---|---|
| V1 | SQL Injection no login (bypass de auth) | A03 | `POST /api/auth/login` | e-mail: `' OR '1'='1' -- ` · senha: qualquer |
| V2 | Broken Authentication (token sem assinatura) | API2 / A07 | header `Authorization` · `server.js` | `Bearer ` + `base64({"sub":1,"role":"admin"})` |
| V3 | BOLA / IDOR (sem autorização) | API1 / A01 | `GET /api/employees/:id`, `DELETE /api/employees/:id` | `GET /api/employees/1` sem token |
| V4 | Mass Assignment (escalonamento) | API3 / A08 | `PUT /api/employees/:id` | `{"role":"admin","salary":999999}` |
| V5 | Exposição de dados sensíveis | API3 / A02 | `GET /api/employees`, `GET /api/auth/me` | `GET /api/employees` (retorna senha/salário) |
| V6 | Sem rate limiting (força bruta) | API4 | `POST /api/auth/login` | laço de `curl` com senhas |
| V7 | Senha em texto puro | A02 | `app-vuln/db.js` (coluna `password`) | visível em `GET /api/employees` |
| V8 | SQL Injection no filtro de busca | A03 | `GET /api/employees?search=` | `?search=x' OR '1'='1` |
| V9 | Command Injection | A03 | `GET /api/tools/ping?host=` | `?host=127.0.0.1;id` |
| V10 | Path Traversal / LFI | A01 / A05 | `GET /api/files?name=` | `?name=../secret-config.txt` ou `../../../../etc/passwd` |
| V11 | SSRF | A10 / API7 | `GET /api/fetch-url?url=` | `?url=http://127.0.0.1:3001/api/employees` |
| V12 | Prototype Pollution | A08 | `POST /api/settings` | `{"__proto__":{"isAdmin":true}}` |
| V13 | Clickjacking (sem X-Frame-Options/CSP) | A05 | todas as respostas | embutir a página em um `<iframe>` |
| V14 | Open Redirect | A01 | `GET /go?to=` | `?to=https://evil.example` |
| V15 | CORS mal configurado (reflete Origin + credenciais) | A05 / API8 | middleware CORS · `server.js` | requisição com `Origin: http://evil.example` |
| V16 | Misconfiguration (vaza stack trace e SQL) | A05 | handler de erro · login | enviar `'` e ler a `sql`/`stack` na resposta |
| V17 | Reflected XSS (server-side) | A03 | `GET /search?q=` | `?q=<script>alert(document.domain)</script>` |
| V18 | Stored / DOM XSS (bio, descrição, busca) | A03 | `app-vuln/public/index.html` (`innerHTML`) | bio: `<img src=x onerror=alert(document.cookie)>` |

---

## Dependências ruins (fixtures/deps)

> **Regra de segurança:** os nomes maliciosos/alucinados ficam como **dados** nos arquivos abaixo — **nunca instale**. Um nome de typosquat pode resolver para malware real vivo no registry. A pipeline de IA lê esses arquivos e classifica cada pacote **antes** de qualquer `npm install`.

### Typosquatting — `suspect-packages.json`
| Pacote (falso) | Imita | Observação |
|---|---|---|
| `expresss` | express | letra duplicada |
| `lodahs` | lodash | letras trocadas |
| `reqeust` | request | transposição de letras |
| `axioss` | axios | letra extra |
| `crossenv` | cross-env | **malware real de 2017** (roubava env no postinstall) |
| `electron-native-notify` | (cadeia Copay) | **ataque de supply chain real de 2019** |

### Alucinadas / inexistentes (slopsquatting) — `suspect-packages.json`
| Pacote (não existe) | Por que é alvo |
|---|---|
| `fast-json-validator-pro` | nome plausível que uma IA inventaria |
| `react-secure-storage-lite` | alvo típico de slopsquatting |
| `express-auth-guard` | soa como middleware real |
| `openai-helper-sdk` | SDKs alucinados são alvo comum |
| `node-safe-eval-plus` | nome sugere falsa segurança |

### Reais com CVE conhecido — `outdated-cve.json`
| Pacote | Versão | CVE | Problema |
|---|---|---|---|
| lodash | 4.17.11 | CVE-2019-10744 | Prototype pollution (`defaultsDeep`) |
| minimist | 1.2.0 | CVE-2020-7598 | Prototype pollution |
| axios | 0.21.0 | CVE-2020-28168 | SSRF via bypass de proxy em redirect |
| node-forge | 0.10.0 | CVE-2022-24771 | Verificação de assinatura RSA falha |
| jsonwebtoken | 8.5.0 | CVE-2022-23540 | Verificação de assinatura insegura |
| marked | 0.3.6 | CVE-2017-1000427 | XSS / ReDoS no parser de Markdown |

### Pacote malicioso simulado (inerte) — `analytics-helper/`
| O que tem | Onde | Sinal a detectar |
|---|---|---|
| `postinstall` que roda script | `package.json` | install script executando código arbitrário |
| coleta de `process.env` + dados da máquina | `index.js` → `collect()` | leitura de segredos/ambiente |
| "exfiltração" para C2 (desativada) | `index.js` → `send()` (com token hardcoded) | envio de dados para servidor externo |

A exfiltração está travada por `const ENABLED = false` — **nada perigoso executa**; o código serve só como amostra do padrão que o SAST/IA deve flagar.

---

## Próximo passo (foco do projeto)
Com o alvo e as fixtures prontos, construir a **pipeline de verificação**: SBOM (CycloneDX), SCA (trivy/osv-scanner), SAST (semgrep), um *hallucination guard* que valida nomes de pacote no registry, e uma camada de **IA para triagem** — com os portões determinísticos bloqueando e a IA explicando.
