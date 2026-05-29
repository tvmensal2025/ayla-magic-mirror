#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""diff-conversational.py — equivalente do diff-bot-flow.py para os
`conversational/index.ts` (Requisito 15.2).

Mesma normalização que diff-bot-flow.py, alvos diferentes.
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import sys
from typing import List


def normalize(src: str) -> List[str]:
    src = re.sub(r"/\*[\s\S]*?\*/", "", src)
    out: List[str] = []
    for raw in src.splitlines():
        line = raw.split("//", 1)[0].rstrip()
        line = re.sub(r"\s+", " ", line.strip())
        if not line:
            continue
        out.append(line)
    return out


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="Diff normalizado dos conversational/index.ts.")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    here = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.normpath(os.path.join(here, "..", "..", ".."))
    left_rel = "supabase/functions/whapi-webhook/handlers/conversational/index.ts"
    right_rel = "supabase/functions/evolution-webhook/handlers/conversational/index.ts"
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

    payload = {
        "version": 1,
        "left": left_rel,
        "right": right_rel,
        "left_lines_total": left_total,
        "right_lines_total": right_total,
        "left_lines_normalized": len(left),
        "right_lines_normalized": len(right),
        "diff_lines_total": diff_count,
    }
    if args.verbose:
        payload["unified_diff_preview"] = diff[:500]
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
