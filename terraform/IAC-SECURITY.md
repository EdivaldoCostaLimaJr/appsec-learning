# IaC vulnerável — Terraform (AWS)

Configuração **intencionalmente insegura** para disparar scanners de IaC. Não requer credenciais nem `apply` — é análise estática dos `.tf`.

```bash
trivy config terraform/
checkov -d terraform/
tfsec terraform/
```

## Misconfigurações por arquivo

| Arquivo | Problema |
|---|---|
| `provider.tf` | Credenciais AWS hardcoded (access/secret key) |
| `s3.tf` | Bucket `public-read`; `public_access_block` tudo `false`; policy com `Principal: *`; sem criptografia, versionamento e logging |
| `network.tf` | Security group liberando `0.0.0.0/0` em todas as portas, SSH (22) e RDP (3389) |
| `compute.tf` | EC2 com IP público; IMDSv1 (`http_tokens = optional`); EBS/volume sem criptografia; segredos no `user_data` |
| `database.tf` | RDS `publicly_accessible`; sem criptografia; senha hardcoded; sem backup; sem IAM auth |
| `iam.tf` | Policy `Action: *` / `Resource: *`; `aws_iam_access_key` gerada; role com `assume_role` de `Principal: *` |
| `terraform.tfvars` | Segredos versionados (senha do banco, API key, secret key AWS) |

## Resultado esperado
`trivy config terraform/` reporta dezenas de achados (CRITICAL/HIGH), incluindo buckets públicos, SG aberto, RDS exposto, IAM com wildcard e recursos sem criptografia.

## Como corrigir (o que a pipeline deve exigir)
- Credenciais via IAM roles / OIDC, nunca hardcoded; segredos fora do versionamento.
- S3 privado, `block_public_access` tudo `true`, criptografia (SSE-KMS), versionamento e logging.
- Security groups com origem restrita (sem `0.0.0.0/0` em portas administrativas).
- EC2 com IMDSv2 obrigatório (`http_tokens = required`) e volumes criptografados.
- RDS privado, criptografado, com backup e IAM auth.
- IAM com privilégio mínimo (sem `*:*`); evitar access keys de longo prazo.
