#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""diff-bot-flow.py — comparação normalizada Whapi vs Evolution (Requisito 15.1).

Compara os dois `bot-flow.ts` em uma forma normalizada (sem comentários,
sem espaços em branco redundantes, sem strings de log triviais) e
relata a contagem de linhas divergentes por região do arquivo.

Uso:
    python3 diff-bot-flow.py             # JSON em stdout
    python3 diff-bot-flow.py --verbose   # inclui diff unified

Saída JSON:
    {
      "version": 1,
      "left":  "supabase/functions/whapi-webhook/handlers/bot-flow.ts",
      "right": "supabase/functions/evolution-webhook/handlers/bot-flow.ts",
      "left_lines_total":  5264,
      "right_lines_total": 4641,
      "left_lines_normalized":  N,
      "right_lines_normalized": M,
      "diff_lines_total":     K,
      "regions": [
        { "label": "STEP:aguardando_conta", "diff_lines": 12 },
        ...
      ]
    }
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import sys
from typing import Dict, List, Tuple


def normalize(src: str) -> List[str]:
    """Remove blocos /* */ e linhas // … , trim e descarta vazios."""
    src = re.sub(r"/\*[\s\S]*?\*/", "", src)
    out: List[str] = []
    for raw in src.splitlines():
        line = raw.split("//", 1)[0].rstrip()
        line = re.sub(r"\s+", " ", line.strip())
        if not line:
            continue
        out.append(line)
    return out


def split_regions(lines: List[str]) -> Dict[str, List[str]]:
    """Heurística simples: agrupa por step_key encontrado em
    `case "<step>":` ou em `step === "<step>"`."""
    regions: Dict[str, List[str]] = {"PREAMBLE": []}
    current = "PREAMBLE"
    case_re = re.compile(r'case\s+"([^"]+)"\s*:')
    eq_re = re.compile(r'step\s*===\s*"([^"]+)"')
    for ln in lines:
        m = case_re.search(ln) or eq_re.search(ln)
        if m:
            current = f"STEP:{m.group(1)}"
            regions.setdefault(current, [])
        regions[current].append(ln)
    return regions


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="Diff normalizado dos bot-flow.ts.")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    here = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.normpath(os.path.join(here, "..", "..", ".."))
    left_rel = "supabase/functions/whapi-webhook/handlers/bot-flow.ts"
    right_rel = "supabase/functions/evolution-webhook/handlers/bot-flow.ts"
    left_abs = os.path.join(repo_root, left_rel)
    right_abs = os.path.join(repo_root, right_rel)

    with open(left_abs, "r", encoding="utf-8") as fh:
        left_raw = fh.read()
    with open(right_abs, "r", encoding="utf-8") as fh:
        right_raw = fh.read()

    left_total = left_raw.count("\n") + 1
    right_total = right_raw.count("\n") + 1
    left = normalize(left_raw)
    right = normalize(right_raw)

    diff = list(difflib.unified_diff(left, right, n=0, lineterm=""))
    diff_count = sum(
        1 for d in diff if d.startswith(("+", "-")) and not d.startswith(("+++", "---"))
    )

    left_regions = split_regions(left)
    right_regions = split_regions(right)
    region_diffs: List[Tuple[str, int]] = []
    keys = sorted(set(left_regions) | set(right_regions))
    for k in keys:
        l = left_regions.get(k, [])
        r = right_regions.get(k, [])
        rdiff = list(difflib.unified_diff(l, r, n=0, lineterm=""))
        rcount = sum(
            1 for d in rdiff if d.startswith(("+", "-")) and not d.startswith(("+++", "---"))
        )
        if rcount > 0:
            region_diffs.append((k, rcount))

    region_diffs.sort(key=lambda x: -x[1])
    payload = {
        "version": 1,
        "left": left_rel,
        "right": right_rel,
        "left_lines_total": left_total,
        "right_lines_total": right_total,
        "left_lines_normalized": len(left),
        "right_lines_normalized": len(right),
        "diff_lines_total": diff_count,
        "regions": [{"label": k, "diff_lines": n} for k, n in region_diffs],
    }
    if args.verbose:
        payload["unified_diff_preview"] = diff[:500]
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
