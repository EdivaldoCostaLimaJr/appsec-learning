#!/usr/bin/env python3
"""Normaliza a saída JSON de um scanner e gera um resumo limpo.

Escreve uma tabela em Markdown no GitHub Step Summary (--summary) e imprime
uma linha-resumo no console. Nunca falha o job: erros viram um aviso no resumo.
"""
import argparse
import json
import sys
from collections import Counter

SEV_ORDER = ["CRITICAL", "HIGH", "ERROR", "MEDIUM", "WARNING", "LOW", "INFO", "UNKNOWN"]
SEV_EMOJI = {"CRITICAL": "🔴", "HIGH": "🟠", "MEDIUM": "🟡", "LOW": "🔵",
             "WARNING": "🟡", "ERROR": "🟠", "INFO": "⚪", "UNKNOWN": "⚪"}

TOOLS = {
    "semgrep":      ("🔎 Código (SAST — Semgrep)", "normaliza_semgrep"),
    "gitleaks":     ("🔑 Secrets (Gitleaks)", "normaliza_gitleaks"),
    "trivy-config": ("🏗️  IaC & Config (Trivy)", "normaliza_trivy_config"),
    "trivy-image":  ("📦 Container (Trivy image)", "normaliza_trivy_image"),
}


def normaliza_semgrep(d):
    for r in d.get("results", []):
        yield (
            str(r.get("extra", {}).get("severity", "UNKNOWN")).upper(),
            r.get("check_id", "regra").split(".")[-1],
            f"{r.get('path')}:{r.get('start', {}).get('line')}",
        )


def normaliza_gitleaks(d):
    items = d if isinstance(d, list) else d.get("findings", [])
    for r in items:
        yield ("HIGH", r.get("RuleID", "secret"), f"{r.get('File')}:{r.get('StartLine')}")


def normaliza_trivy_config(d):
    for res in d.get("Results", []):
        for m in res.get("Misconfigurations", []) or []:
            cause = m.get("CauseMetadata") or {}
            yield (
                str(m.get("Severity", "UNKNOWN")).upper(),
                f"{m.get('ID', '')} {m.get('Title', '')}".strip(),
                f"{res.get('Target')}:{cause.get('StartLine', '')}",
            )


def normaliza_trivy_image(d):
    seen = set()
    for res in d.get("Results", []):
        for v in res.get("Vulnerabilities", []) or []:
            vid = v.get("VulnerabilityID", "")
            key = (vid, v.get("PkgName"))
            if key in seen:
                continue
            seen.add(key)
            yield (
                str(v.get("Severity", "UNKNOWN")).upper(),
                f"{vid} · {v.get('PkgName')} {v.get('InstalledVersion', '')}".strip(),
                res.get("Target", ""),
            )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tool", required=True, choices=TOOLS.keys())
    ap.add_argument("--input", required=True)
    ap.add_argument("--summary", required=True)
    ap.add_argument("--limit", type=int, default=20)
    args = ap.parse_args()

    title, fn_name = TOOLS[args.tool]
    out = [f"## {title}\n"]

    try:
        with open(args.input, encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception as e:  # noqa: BLE001
        out.append(f"> ⚠️ Scanner não produziu saída analisável ({e}).\n")
        _write(args.summary, out)
        print(f"{args.tool}: sem saída")
        return

    rows = sorted(
        globals()[fn_name](data),
        key=lambda r: SEV_ORDER.index(r[0]) if r[0] in SEV_ORDER else 99,
    )
    counts = Counter(r[0] for r in rows)

    if not rows:
        out.append("> ✅ Nenhum achado.\n")
        _write(args.summary, out)
        print(f"{args.tool}: 0 achados")
        return

    badge = " · ".join(f"{SEV_EMOJI.get(s, '⚪')} {s}: {counts[s]}"
                       for s in SEV_ORDER if counts.get(s))
    out.append(f"**{len(rows)} achados** — {badge}\n")
    out.append("| Sev | Achado | Local |")
    out.append("|-----|--------|-------|")
    for sev, what, where in rows[: args.limit]:
        what = what.replace("|", "\\|")[:80]
        out.append(f"| {SEV_EMOJI.get(sev, '⚪')} {sev} | {what} | `{where}` |")
    if len(rows) > args.limit:
        out.append(f"\n_… e mais {len(rows) - args.limit} achados._")
    out.append("")

    _write(args.summary, out)
    print(f"{args.tool}: {len(rows)} achados — {badge}")


def _write(path, lines):
    try:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
    except Exception:
        sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
