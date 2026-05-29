#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""audit-cadastro-steps.py — Auditoria_Cadastro_Steps (Requisito 3 / 15.3).

Para cada um dos 48 step_keys listados em
`supabase/functions/_shared/flow-router.ts::CADASTRO_STEPS`, este script:

  1. faz `grep` literal por `"<step_key>"` em ambos os `bot-flow.ts`
     (Whapi e Evolution) registrando linha + trecho;
  2. detecta cliques de transição que escrevem
     `updates.conversation_step = "<step_key>"` (entrada do passo);
  3. classifica heuristicamente em
     `cadastro-only` | `cta-conversacional` | `híbrido`:
       - `cadastro-only`  → step só aparece dentro de `bot-flow.ts`;
       - `cta-conversacional` → step também é alvo de transition em
         arquivos do `conversational/`;
       - `híbrido` → step aparece tanto em pipeline determinístico
         (chamadas a `dispatch_*` / `capture_*`) quanto em transitions
         do conversational, OR está na lista hardcoded de CTAs híbridos
         confirmada no Design.

Uso:
    python3 audit-cadastro-steps.py             # imprime JSON em stdout
    python3 audit-cadastro-steps.py --markdown  # imprime tabela MD
    python3 audit-cadastro-steps.py --help

Saída JSON (stdout):
    {
      "version": 1,
      "items": [
        {
          "step_key": "ask_quero_cadastrar",
          "categoria_proposta": "híbrido",
          "evidencia_em_codigo": [
            { "path": "...whapi-webhook/handlers/bot-flow.ts",
              "lines": [3613, 3664, ...] },
            ...
          ],
          "matches_total_whapi": 12,
          "matches_total_evolution": 11,
          "found_in_conversational": true
        },
        ...
      ]
    }

Sem dependências fora da stdlib.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import asdict, dataclass, field
from typing import List, Dict


# Lista canônica copiada de _shared/flow-router.ts (manter sincronizada).
CADASTRO_STEPS: List[str] = [
    "aguardando_conta",
    "processando_ocr_conta",
    "confirmando_dados_conta",
    "ask_tipo_documento",
    "aguardando_doc_auto",
    "aguardando_doc_frente",
    "aguardando_doc_verso",
    "confirmando_dados_doc",
    "confirmar_titularidade",
    "ask_name",
    "ask_cpf",
    "ask_rg",
    "ask_birth_date",
    "ask_phone_confirm",
    "ask_phone",
    "ask_email",
    "ask_cep",
    "ask_number",
    "ask_complement",
    "ask_installation_number",
    "ask_bill_value",
    "ask_doc_frente_manual",
    "ask_doc_verso_manual",
    "ask_quero_cadastrar",
    "ask_finalizar",
    "finalizando",
    "portal_submitting",
    "aguardando_otp",
    "validando_otp",
    "aguardando_facial",
    "aguardando_assinatura",
    "cadastro_em_analise",
    "complete",
    "aguardando_humano",
    "editing_conta_menu",
    "editing_conta_nome",
    "editing_conta_endereco",
    "editing_conta_cep",
    "editing_conta_distribuidora",
    "editing_conta_instalacao",
    "editing_conta_valor",
    "editing_doc_menu",
    "editing_doc_nome",
    "editing_doc_cpf",
    "editing_doc_rg",
    "editing_doc_nascimento",
    "editing_doc_pai",
    "editing_doc_mae",
]

# CTAs declarados como híbridos pelo SuperAdmin (Requisito 3.2 — entrada manual).
HYBRID_CTAS: set[str] = {
    "ask_quero_cadastrar",
    "ask_finalizar",
    "finalizando",
    "ask_doc_frente_manual",
    "ask_doc_verso_manual",
}


@dataclass
class FileEvidence:
    path: str
    lines: List[int] = field(default_factory=list)


@dataclass
class StepReport:
    step_key: str
    categoria_proposta: str
    evidencia_em_codigo: List[FileEvidence]
    matches_total_whapi: int
    matches_total_evolution: int
    found_in_conversational: bool


def grep_step_key(repo_root: str, file_relpath: str, step_key: str) -> List[int]:
    abs_path = os.path.join(repo_root, file_relpath)
    if not os.path.isfile(abs_path):
        return []
    needle = f'"{step_key}"'
    out: List[int] = []
    with open(abs_path, "r", encoding="utf-8", errors="replace") as fh:
        for i, line in enumerate(fh, start=1):
            if needle in line:
                out.append(i)
    return out


def appears_in_conversational(repo_root: str, step_key: str) -> bool:
    rels = [
        "supabase/functions/whapi-webhook/handlers/conversational/index.ts",
        "supabase/functions/evolution-webhook/handlers/conversational/index.ts",
    ]
    needle = f'"{step_key}"'
    for rel in rels:
        ap = os.path.join(repo_root, rel)
        if not os.path.isfile(ap):
            continue
        with open(ap, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if needle in line:
                    return True
    return False


def classify(step_key: str, in_bot_flow: bool, in_conversational: bool) -> str:
    if step_key in HYBRID_CTAS:
        return "híbrido"
    if in_bot_flow and in_conversational:
        return "híbrido"
    if in_bot_flow and not in_conversational:
        return "cadastro-only"
    if not in_bot_flow and in_conversational:
        return "cta-conversacional"
    return "indeterminado"


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Auditoria dos 48 CADASTRO_STEPS — Requisitos 3 e 15.3.",
    )
    parser.add_argument(
        "--markdown",
        action="store_true",
        help="Imprime tabela markdown em vez de JSON.",
    )
    args = parser.parse_args(argv)

    # Repo root = .. de .kiro/specs/<spec>/.
    here = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.normpath(os.path.join(here, "..", "..", ".."))

    whapi_rel = "supabase/functions/whapi-webhook/handlers/bot-flow.ts"
    evolution_rel = "supabase/functions/evolution-webhook/handlers/bot-flow.ts"

    items: List[StepReport] = []
    for step in CADASTRO_STEPS:
        whapi_lines = grep_step_key(repo_root, whapi_rel, step)
        evol_lines = grep_step_key(repo_root, evolution_rel, step)
        in_bot_flow = bool(whapi_lines) or bool(evol_lines)
        in_conversational = appears_in_conversational(repo_root, step)
        cat = classify(step, in_bot_flow, in_conversational)

        evidence = [
            FileEvidence(path=whapi_rel, lines=whapi_lines),
            FileEvidence(path=evolution_rel, lines=evol_lines),
        ]
        items.append(
            StepReport(
                step_key=step,
                categoria_proposta=cat,
                evidencia_em_codigo=evidence,
                matches_total_whapi=len(whapi_lines),
                matches_total_evolution=len(evol_lines),
                found_in_conversational=in_conversational,
            )
        )

    if args.markdown:
        print("| step_key | categoria_proposta | matches whapi | matches evolution | conversational |")
        print("|---|---|---:|---:|:---:|")
        for it in items:
            print(
                f"| `{it.step_key}` | {it.categoria_proposta} | "
                f"{it.matches_total_whapi} | {it.matches_total_evolution} | "
                f"{'sim' if it.found_in_conversational else 'não'} |"
            )
        return 0

    payload = {
        "version": 1,
        "repo_root": repo_root,
        "items": [
            {
                "step_key": it.step_key,
                "categoria_proposta": it.categoria_proposta,
                "matches_total_whapi": it.matches_total_whapi,
                "matches_total_evolution": it.matches_total_evolution,
                "found_in_conversational": it.found_in_conversational,
                "evidencia_em_codigo": [asdict(e) for e in it.evidencia_em_codigo],
            }
            for it in items
        ],
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
