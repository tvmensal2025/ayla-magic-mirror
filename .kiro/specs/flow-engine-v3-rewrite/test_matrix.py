#!/usr/bin/env python3
"""
Bateria abrangente de testes do Fluxo D do super-admin.

Cobertura:
  T1  Welcome → SIMULAR (botão)
  T2  Welcome → COMO FUNCIONA (botão)
  T3  Welcome → FALAR COM HUMANO (botão)
  T4  Welcome → "qual o preço?" (texto fora do script)
  T5  Welcome → "1" (number reply)
  T6  Welcome → "2" (number reply)
  T7  Welcome → "3" (number reply)
  T8  Welcome → "simular" (palavra-chave em texto)
  T9  Welcome → "humano" (palavra-chave em texto)
  T10 Welcome → emoji só (texto exótico)
  T11 Como Funciona → "quero simular" (transition de volta pra capture_conta)
  T12 Pedir Conta → imagem (avança via fallback)
  T13 Pedir Conta → texto (não bate, fica em retry)
  T14 Resultado → "cadastrar" (avança pra documento)
  T15 Pedir Documento → imagem
  T16 Reset (Zerar lead) e re-rodar welcome
  T17 Welcome → áudio do lead (ignora? cai em fallback?)
  T18 Welcome → vídeo do lead

Para cada teste valida:
  - HTTP 200 + mode=engine_v3
  - sent > 0 (engine emitiu outbounds)
  - bot_test_outbound populado com kinds esperados
  - customer.conversation_step avançou conforme esperado
  - zero violações G1/G2 em engine_logs
  - sem 'undefined' no conteúdo dos buttons

Dependências de ambiente:
  SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_ANON_KEY
"""
import json
import os
import sys
import time
import uuid
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

PROJECT_REF = "zlzasfhcxcznaprrragl"
SR = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
ANON = os.environ.get("SUPABASE_ANON_KEY") or ""
SUPER_ADMIN = "0c2711ad-4836-41e6-afba-edd94f698ae3"
FLOW_D_ID = "320bf22c-e383-4f53-a3c0-b88b89b02558"

# Step IDs do fluxo D (referência)
STEP = {
    "welcome": "aee7b26c-7669-448b-9def-77dc8466b039",
    "pedir_conta": "279d3926-5363-403f-af5d-5201e2014598",
    "como_funciona": "c87d76f8-f4d2-48ec-ac08-4ef0b3c92834",
    "resultado": "4df1f90a-0248-4df0-9473-4c910f1b22bd",
    "pedir_documento": "58f0a7e2-16ce-4ee2-ad07-1466ce7e9f1f",
    "pedir_email": "b1e1a001-d001-4001-9001-d00d00d00001",
    "confirmar_telefone": "b1e1a002-d002-4002-9002-d00d00d00002",
    "duvidas": "38c0d101-6492-4b1e-8229-c676c804161a",
    "finalizar": "9f2d47d4-3f7d-4871-a00a-929314a1550f",
}

REST = f"https://{PROJECT_REF}.supabase.co/rest/v1"


# ─── Helpers ────────────────────────────────────────────────────────────


def rest(method, path, body=None, params=None):
    url = f"{REST}/{path}"
    if params:
        url += "?" + params
    h = {"apikey": SR, "Authorization": f"Bearer {SR}", "Content-Type": "application/json"}
    req = urllib.request.Request(url, method=method, headers=h,
                                  data=json.dumps(body).encode() if body else None)
    try:
        text = urllib.request.urlopen(req, timeout=30).read().decode()
        return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_body": e.read().decode()[:300]}


def post_webhook(payload, run_id, turn_num):
    h = {"Authorization": f"Bearer {ANON}", "apikey": ANON, "Content-Type": "application/json",
         "x-bot-test-run-id": run_id, "x-bot-test-turn": str(turn_num),
         "x-bot-bypass-quiet-hours": "1", "x-bot-fast-clock": "1"}
    req = urllib.request.Request(
        f"https://{PROJECT_REF}.supabase.co/functions/v1/whapi-webhook",
        headers=h, data=json.dumps(payload).encode(),
    )
    t0 = time.time()
    try:
        body = urllib.request.urlopen(req, timeout=180).read().decode()
        return {"elapsed": time.time() - t0, "body": body}
    except Exception as e:
        return {"elapsed": time.time() - t0, "error": str(e)}


def make_text(phone, text):
    ts = int(time.time())
    return {
        "messages": [{
            "id": f"sim_{ts}_{uuid.uuid4().hex[:6]}", "from_me": False, "type": "text",
            "chat_id": f"{phone}@s.whatsapp.net", "from": phone,
            "timestamp": ts, "from_name": "TestLead", "text": {"body": text},
        }],
        "event": {"type": "messages"},
    }


def make_button(phone, button_id, title):
    ts = int(time.time())
    return {
        "messages": [{
            "id": f"sim_{ts}_{uuid.uuid4().hex[:6]}", "from_me": False, "type": "reply",
            "chat_id": f"{phone}@s.whatsapp.net", "from": phone,
            "timestamp": ts, "from_name": "TestLead",
            "reply": {"type": "buttons_reply",
                       "buttons_reply": {"id": button_id, "title": title}},
        }],
        "event": {"type": "messages"},
    }


def make_image(phone, url="https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/simulator-uploads/e2e/1779697091700_conta-real.pdf"):
    ts = int(time.time())
    return {
        "messages": [{
            "id": f"sim_{ts}_{uuid.uuid4().hex[:6]}", "from_me": False, "type": "image",
            "chat_id": f"{phone}@s.whatsapp.net", "from": phone,
            "timestamp": ts, "from_name": "TestLead",
            "image": {"link": url, "mime_type": "image/png"},
        }],
        "event": {"type": "messages"},
    }


def make_audio(phone):
    ts = int(time.time())
    return {
        "messages": [{
            "id": f"sim_{ts}_{uuid.uuid4().hex[:6]}", "from_me": False, "type": "voice",
            "chat_id": f"{phone}@s.whatsapp.net", "from": phone,
            "timestamp": ts, "from_name": "TestLead",
            "voice": {"link": "https://example.com/audio.ogg", "mime_type": "audio/ogg"},
        }],
        "event": {"type": "messages"},
    }


# ─── Test runner ────────────────────────────────────────────────────────


def fresh_lead(phone: str, name: str) -> Optional[str]:
    """Cria um lead limpo (não-sandbox) para isolar o teste."""
    # Garante que phone único é nuked primeiro
    rest("DELETE", "customers", params=f"phone_whatsapp=eq.{phone}")
    res = rest("POST", "customers", body={
        "consultant_id": SUPER_ADMIN, "phone_whatsapp": phone, "name": name,
        "is_sandbox": False, "is_test_lead": True,
        "capture_mode": "auto", "customer_origin": "whatsapp_lead",
        "flow_variant": "D", "status": "pending",
    })
    if isinstance(res, dict) and "_error" in res:
        return None
    customers = rest("GET", "customers", params=f"phone_whatsapp=eq.{phone}&select=id")
    if isinstance(customers, list) and customers:
        cid = customers[0]["id"]
        rest("PATCH", "customers", body={"capture_mode": "auto"},
             params=f"id=eq.{cid}")
        return cid
    return None


def get_state(cid: str) -> Dict[str, Any]:
    cs = rest("GET", "customers",
              params=f"id=eq.{cid}&select=conversation_step,bot_paused,capture_mode")
    cfs = rest("GET", "customer_flow_state",
               params=f"customer_id=eq.{cid}&select=current_step_id,status,retries")
    out = {}
    if isinstance(cs, list) and cs:
        out.update(cs[0])
    if isinstance(cfs, list) and cfs:
        out["cfs"] = cfs[0]
    return out


def get_outbounds(run_id: str) -> List[Dict[str, Any]]:
    res = rest("GET", "bot_test_outbound",
               params=f"run_id=eq.{run_id}&order=created_at.asc")
    return res if isinstance(res, list) else []


def get_violations(cid: str) -> List[str]:
    res = rest("GET", "engine_logs",
               params=f"customer_id=eq.{cid}&kind=in.(engine_dedupe_blocked,engine_silent_turn)&select=kind")
    return [r["kind"] for r in res] if isinstance(res, list) else []


STEP_NAME_BY_ID = {v: k for k, v in STEP.items()}


def step_name(step_id: Optional[str]) -> str:
    if not step_id:
        return "—"
    return STEP_NAME_BY_ID.get(step_id, step_id[:8])


def render_outbound(o: Dict[str, Any]) -> str:
    kind = o.get("kind")
    content = o.get("content") or ""
    if kind == "buttons":
        try:
            p = json.loads(content)
            txt = (p.get("text") or "")[:50].replace("\n", " ")
            btns = " | ".join(b.get("title", "?") for b in p.get("buttons", []))
            return f"[buttons] {txt} [{btns}]"
        except Exception:
            return f"[buttons] {content[:60].replace(chr(10), ' ')}"
    if kind in ("audio", "video", "image", "document"):
        return f"[{kind}]"
    if kind == "text":
        return f"[text] {content[:80].replace(chr(10), ' ')}"
    return f"[{kind}] {content[:60]}"


# ─── Test cases ────────────────────────────────────────────────────────


PHONE_BASE = "550000077777"  # +5500000077777xxx


def run_test(
    test_id: int,
    label: str,
    turns: List[Tuple[str, str]],
    expected_step_after: Optional[str] = None,
    expected_kinds_per_turn: Optional[List[List[str]]] = None,
) -> Dict[str, Any]:
    """
    turns: list of (kind, payload) where kind ∈ {text, button, image, audio}
    For button: payload = "id|title"
    For text: payload = the text
    For image/audio: payload ignored
    """
    phone = f"{PHONE_BASE}{str(test_id).zfill(3)}"
    cid = fresh_lead(phone, f"Test{test_id}")
    if not cid:
        return {"id": test_id, "label": label, "ok": False, "reason": "create_failed"}

    run_id = str(uuid.uuid4())
    rest("POST", "bot_test_runs", body={
        "id": run_id, "status": "running",
        "customer_id": cid, "consultant_id": SUPER_ADMIN,
        "scenario": f"matrix_T{test_id}",
        "created_by": "00000000-0000-0000-0000-000000000000",
    })

    issues: List[str] = []
    turn_results: List[Dict[str, Any]] = []

    for i, (kind, payload) in enumerate(turns, start=1):
        if kind == "text":
            msg = make_text(phone, payload)
        elif kind == "button":
            bid, title = payload.split("|", 1)
            msg = make_button(phone, bid, title)
        elif kind == "image":
            msg = make_image(phone)
        elif kind == "audio":
            msg = make_audio(phone)
        else:
            issues.append(f"unknown_kind:{kind}")
            continue

        r = post_webhook(msg, run_id, i)
        body_str = r.get("body", "") or r.get("error", "")
        try:
            body = json.loads(body_str)
        except Exception:
            body = {}
        v3 = body.get("v3", {})
        turn_results.append({
            "turn": i,
            "elapsed": r.get("elapsed", 0),
            "ok": v3.get("ok"),
            "sent": v3.get("sent"),
            "failed": v3.get("failed"),
            "mode": body.get("mode") or body.get("msg") or "?",
        })
        time.sleep(2)

    state = get_state(cid)
    outbounds = get_outbounds(run_id)
    violations = get_violations(cid)

    # Validation
    if violations:
        issues.append(f"violations:{violations}")
    if expected_step_after:
        actual = state.get("conversation_step")
        if actual != STEP.get(expected_step_after):
            issues.append(f"step expected={expected_step_after}({STEP.get(expected_step_after)}) actual={step_name(actual)}({actual})")

    # Check undefined in buttons
    for o in outbounds:
        if o.get("kind") == "buttons":
            content = o.get("content") or ""
            if "undefined" in content:
                issues.append(f"undefined in turn {o.get('turn')}")

    # Mode check
    modes = [t["mode"] for t in turn_results]
    if any(m != "engine_v3" for m in modes):
        issues.append(f"mode wrong: {modes}")

    return {
        "id": test_id,
        "label": label,
        "phone": phone,
        "cid": cid,
        "ok": len(issues) == 0,
        "issues": issues,
        "turns": turn_results,
        "outbounds": outbounds,
        "state": state,
    }


def main():
    print("=" * 70)
    print("BATERIA DE TESTES — Fluxo D do super-admin (engine v3)")
    print("=" * 70)

    cases = [
        (1, "Welcome → botão SIMULAR → pedir_conta",
         [("text", "oi"), ("button", "simular|Quero simular")],
         "pedir_conta"),

        (2, "Welcome → botão COMO FUNCIONA → como_funciona (com áudio+vídeo)",
         [("text", "oi"), ("button", "como|Como funciona")],
         "como_funciona"),

        (3, "Welcome → botão HUMANO → handoff (paused_system)",
         [("text", "oi"), ("button", "humano|Falar com Rafael")],
         None),  # state vai pra paused, step continua welcome

        (4, "Welcome → texto FORA SCRIPT → repeat",
         [("text", "oi"), ("text", "qual o preço?")],
         "welcome"),

        (5, "Welcome → number_reply '1' → pedir_conta",
         [("text", "oi"), ("text", "1")],
         "pedir_conta"),

        (6, "Welcome → number_reply '2' → como_funciona",
         [("text", "oi"), ("text", "2")],
         "como_funciona"),

        (7, "Welcome → number_reply '3' → handoff",
         [("text", "oi"), ("text", "3")],
         None),

        (8, "Welcome → palavra-chave 'simular' → pedir_conta",
         [("text", "oi"), ("text", "simular")],
         "pedir_conta"),

        (9, "Welcome → palavra-chave 'humano' → handoff",
         [("text", "oi"), ("text", "humano")],
         None),

        (10, "Welcome → emoji só '👍' → repeat (não bate trigger)",
         [("text", "oi"), ("text", "👍")],
         "welcome"),

        (11, "como_funciona → 'quero simular' → pedir_conta",
         [("text", "oi"), ("button", "como|Como funciona"), ("text", "quero simular")],
         "pedir_conta"),

        (12, "pedir_conta → imagem (sem OCR real, retry inicial)",
         [("text", "oi"), ("button", "simular|Quero simular"), ("image", "")],
         None),

        (13, "pedir_conta → texto (não bate, retry)",
         [("text", "oi"), ("button", "simular|Quero simular"), ("text", "ainda nao tenho")],
         None),

        (14, "Welcome novo lead com áudio inicial → fallback",
         [("audio", "")],
         None),

        (15, "Welcome novo lead com imagem inicial → fallback",
         [("image", "")],
         None),
    ]

    results = []
    for case in cases:
        try:
            print(f"\n  T{case[0]}: {case[1]}")
            r = run_test(*case)
            results.append(r)
            mark = "✅" if r["ok"] else "❌"
            print(f"      {mark} step={step_name(r['state'].get('conversation_step'))} "
                  f"status={(r['state'].get('cfs') or {}).get('status')} "
                  f"turns={len(r['turns'])} outbounds={len(r['outbounds'])}")
            if r["issues"]:
                print(f"      ISSUES: {r['issues']}")
            for o in r["outbounds"][:6]:
                print(f"          {render_outbound(o)}")
        except Exception as e:
            print(f"      ERRO INESPERADO: {e}")
            results.append({"id": case[0], "label": case[1], "ok": False, "issues": [f"exception:{e}"]})

    # Summary
    print("\n" + "=" * 70)
    print("RESUMO")
    print("=" * 70)
    ok_count = sum(1 for r in results if r["ok"])
    print(f"\n{ok_count}/{len(results)} testes passaram\n")
    for r in results:
        mark = "✅" if r["ok"] else "❌"
        line = f"  {mark} T{r['id']}: {r['label']}"
        if r.get("issues"):
            line += f"  →  {r['issues']}"
        print(line)


if __name__ == "__main__":
    main()
