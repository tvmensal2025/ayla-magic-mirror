#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3-vs-legacy-metrics.py — métricas do Engine_V3 em Modo_Dark (Req 13.2 / 15.4).

Lê `engine_logs` via Supabase REST e calcula as três métricas exigidas pelo
Requisito 13.2 nas últimas 72 horas para cada consultor em `Modo_Dark`:

  1. taxa_divergencia_v3_vs_motor_que_respondeu — proxy: razão
     `engine_invalid_step + engine_no_match` / `engine_step_enter`. Em modo
     dark o V3 não responde, então `invalid + no_match` indicam casos em
     que V3 sairia do trilho se estivesse on. Comparado contra o motor que
     respondeu é o melhor sinal observável sem instrumentação adicional.
  2. invalid_step_por_consultor_72h
  3. no_match_por_consultor_72h

Uso:
    SUPABASE_URL=https://<project>.supabase.co \\
    SUPABASE_SERVICE_ROLE_KEY=eyJ... \\
    python3 v3-vs-legacy-metrics.py [--hours 72]

Stdout: JSON estruturado.

Stdlib only (urllib.request).

Em ambientes sem credenciais (CI sem segredo, dev local), o script imprime
um esqueleto com `error="missing_env"` para diferenciar de "tudo zero".
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from typing import Any, Dict, List


def http_get(url: str, headers: Dict[str, str]) -> Any:
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Extrai métricas Engine_V3 vs legado em Modo_Dark (Requisito 13.2).",
    )
    parser.add_argument("--hours", type=int, default=72)
    args = parser.parse_args(argv)

    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        print(json.dumps({
            "version": 1,
            "error": "missing_env",
            "needed": ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
        }, indent=2))
        return 1

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }

    # 1. Consultores em dark.
    consultants_url = (
        f"{base}/rest/v1/consultants"
        "?select=id,name,flow_engine_v3,use_engine_v3"
        "&flow_engine_v3=eq.dark"
    )
    consultants = http_get(consultants_url, headers)

    # 2. Linhas de engine_logs nas últimas N horas, agregadas por kind via PostgREST.
    #    Para evitar o limite default de 1000 linhas, usamos count=exact por kind.
    kinds = [
        "engine_step_enter",
        "engine_invalid_step",
        "engine_no_match",
        "engine_safe_text",
        "engine_handoff",
    ]
    overall: Dict[str, int] = {}
    horizon = f"now()-interval%20%27{args.hours}%20hours%27"
    for kind in kinds:
        url = (
            f"{base}/rest/v1/engine_logs?select=id"
            f"&kind=eq.{kind}&at=gt.{horizon}"
        )
        # PostgREST devolve count via header Prefer.
        req = urllib.request.Request(
            url,
            headers={**headers, "Prefer": "count=exact", "Range": "0-0"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            content_range = resp.headers.get("Content-Range", "0-0/0")
            total = int(content_range.split("/")[-1])
            overall[kind] = total

    step_enters = max(1, overall.get("engine_step_enter", 0))
    invalid_pct = round(100.0 * overall.get("engine_invalid_step", 0) / step_enters, 2)
    no_match_pct = round(100.0 * overall.get("engine_no_match", 0) / step_enters, 2)

    payload = {
        "version": 1,
        "window_hours": args.hours,
        "consultants_dark": [
            {"id": c["id"], "name": c.get("name"), "flag": c.get("flow_engine_v3")}
            for c in consultants
        ],
        "overall_counts": overall,
        "metrics": {
            "taxa_divergencia_proxy_pct": round(invalid_pct + no_match_pct, 2),
            "engine_invalid_step_pct": invalid_pct,
            "engine_no_match_pct": no_match_pct,
        },
        "thresholds": {
            "promote_v3_max_invalid_pct": 2.0,
            "promote_v3_max_no_match_pct": 5.0,
        },
        "decision_hint": (
            "promote_v3"
            if invalid_pct < 2.0 and no_match_pct < 5.0
            else "retire_v3_or_extend_dark"
        ),
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
