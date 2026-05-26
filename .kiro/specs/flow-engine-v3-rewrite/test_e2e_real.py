#!/usr/bin/env python3
"""
Teste end-to-end real do Fluxo D do super-admin via engine v3.

Cria customers reais (não-sandbox) com telefones simulados, dispara
mensagens reais pelo whapi-webhook e valida o estado por turno.

Usa REST (PostgREST) com service-role para writes/reads (não usa
Management API, que está com rate-limit Cloudflare).

Variáveis de ambiente exigidas:
  SUPABASE_SERVICE_ROLE_KEY  (eyJhbGci... role=service_role)
  SUPABASE_ANON_KEY          (eyJhbGci... role=anon)
"""

import json
import os
import sys
import time
import uuid
import urllib.request
from typing import Any, Dict, List, Optional

PROJECT_REF = "zlzasfhcxcznaprrragl"
SUPER_ADMIN = "0c2711ad-4836-41e6-afba-edd94f698ae3"
FLOW_D_ID = "320bf22c-e383-4f53-a3c0-b88b89b02558"
CONTA_REAL_URL = "https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/simulator-uploads/e2e/1779697091700_conta-real.pdf"

SR = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
ANON = os.environ.get("SUPABASE_ANON_KEY") or ""
if not SR or not ANON:
    print("ERR: defina SUPABASE_SERVICE_ROLE_KEY e SUPABASE_ANON_KEY", file=sys.stderr)
    sys.exit(1)

REST = f"https://{PROJECT_REF}.supabase.co/rest/v1"


def rest(method: str, path: str, body: Optional[Dict] = None,
         params: Optional[str] = None, return_repr: bool = False) -> Any:
    url = f"{REST}/{path}"
    if params:
        url += "?" + params
    headers = {
        "apikey": SR,
        "Authorization": f"Bearer {SR}",
        "Content-Type": "application/json",
    }
    if return_repr:
        headers["Prefer"] = "return=representation"
    req = urllib.request.Request(
        url,
        method=method,
        headers=headers,
        data=json.dumps(body).encode() if body is not None else None,
    )
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        text = resp.read().decode()
        return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_body": e.read().decode()[:300]}


def whapi_post(payload: Dict[str, Any], headers: Dict[str, str]) -> Dict[str, Any]:
    h = {
        "Authorization": f"Bearer {ANON}",
        "apikey": ANON,
        "Content-Type": "application/json",
        **headers,
    }
    req = urllib.request.Request(
        f"https://{PROJECT_REF}.supabase.co/functions/v1/whapi-webhook",
        headers=h,
        data=json.dumps(payload).encode(),
    )
    t0 = time.time()
    try:
        body = urllib.request.urlopen(req, timeout=120).read().decode()
        return {"ok": True, "elapsed": time.time() - t0, "body": body}
    except Exception as e:
        return {"ok": False, "elapsed": time.time() - t0, "error": str(e)}


def cf(text: str, ok: bool = True) -> str:
    return f"[{'OK' if ok else 'FAIL'}] {text}"


def hr(label: str = ""):
    if label:
        print(f"\n========== {label} ==========")
    else:
        print("-" * 60)


def cleanup_phone(phone: str):
    # Get id
    cs = rest("GET", "customers", params=f"phone_whatsapp=eq.{phone}&select=id")
    if not isinstance(cs, list) or not cs:
        return
    for c in cs:
        cid = c["id"]
        rest("DELETE", "bot_handoff_alerts", params=f"customer_id=eq.{cid}")
        rest("DELETE", "customer_flow_state", params=f"customer_id=eq.{cid}")
        rest("DELETE", "conversations", params=f"customer_id=eq.{cid}")
        rest("DELETE", "engine_logs", params=f"customer_id=eq.{cid}")
        rest("DELETE", "customers", params=f"id=eq.{cid}")


def create_customer(phone: str, name: str) -> Optional[str]:
    body = {
        "consultant_id": SUPER_ADMIN,
        "phone_whatsapp": phone,
        "name": name,
        "is_sandbox": False,
        "is_test_lead": True,
        "capture_mode": "auto",
        "customer_origin": "whatsapp_lead",
        "flow_variant": "D",
        "status": "pending",
    }
    res = rest("POST", "customers", body=body, return_repr=True)
    if isinstance(res, list) and res:
        cid = res[0].get("id")
        # Trigger trg_customers_default_capture_mode pode ter virado pra manual
        # Forçar auto após insert.
        rest("PATCH", "customers", body={"capture_mode": "auto"},
             params=f"id=eq.{cid}")
        return cid
    print(f"  ERRO criando customer: {res}")
    return None


def fire_text(phone: str, text: str) -> Dict[str, Any]:
    ts = int(time.time())
    msg_id = f"e2e_{ts}_{uuid.uuid4().hex[:6]}"
    payload = {
        "messages": [{
            "id": msg_id, "from_me": False, "type": "text",
            "chat_id": f"{phone}@s.whatsapp.net", "from": phone,
            "timestamp": ts, "from_name": "Cliente E2E",
            "text": {"body": text},
        }],
        "event": {"type": "messages"},
    }
    return whapi_post(payload, {})


def fire_button(phone: str, button_id: str, title: str) -> Dict[str, Any]:
    ts = int(time.time())
    msg_id = f"e2e_{ts}_{uuid.uuid4().hex[:6]}"
    payload = {
        "messages": [{
            "id": msg_id, "from_me": False, "type": "reply",
            "chat_id": f"{phone}@s.whatsapp.net", "from": phone,
            "timestamp": ts, "from_name": "Cliente E2E",
            "reply": {
                "type": "buttons_reply",
                "buttons_reply": {"id": button_id, "title": title},
            },
        }],
        "event": {"type": "messages"},
    }
    return whapi_post(payload, {})


def fire_document(phone: str, url: str) -> Dict[str, Any]:
    ts = int(time.time())
    msg_id = f"e2e_{ts}_{uuid.uuid4().hex[:6]}"
    payload = {
        "messages": [{
            "id": msg_id, "from_me": False, "type": "document",
            "chat_id": f"{phone}@s.whatsapp.net", "from": phone,
            "timestamp": ts, "from_name": "Cliente E2E",
            "document": {"link": url, "mime_type": "application/pdf"},
        }],
        "event": {"type": "messages"},
    }
    return whapi_post(payload, {})


def state_for(cid: str) -> Dict[str, Any]:
    cs = rest("GET", "customers",
              params=f"id=eq.{cid}&select=conversation_step,bot_paused,capture_mode")
    cfs = rest("GET", "customer_flow_state",
               params=f"customer_id=eq.{cid}&select=current_step_id,status,retries")
    convs = rest("GET", "conversations",
                 params=f"customer_id=eq.{cid}&select=id&limit=200")
    logs = rest("GET", "engine_logs",
                params=f"customer_id=eq.{cid}&select=kind&limit=200")
    out = {}
    if isinstance(cs, list) and cs:
        out.update(cs[0])
    if isinstance(cfs, list) and cfs:
        out["cfs"] = cfs[0]
    out["conv_count"] = len(convs) if isinstance(convs, list) else -1
    out["log_count"] = len(logs) if isinstance(logs, list) else -1
    return out


def violations_for(cid: str) -> List[str]:
    res = rest("GET", "engine_logs",
               params=f"customer_id=eq.{cid}&kind=in.(engine_dedupe_blocked,engine_silent_turn)&select=kind")
    return [r["kind"] for r in res] if isinstance(res, list) else []


def conversations_for(cid: str) -> List[Dict[str, Any]]:
    res = rest("GET", "conversations",
               params=f"customer_id=eq.{cid}&select=message_direction,message_type,message_text,conversation_step,created_at&order=created_at.asc&limit=20")
    return res if isinstance(res, list) else []


def run_scenario(label: str, phone: str, name: str, turns: List[Dict[str, Any]]):
    hr(label)
    cleanup_phone(phone)
    cid = create_customer(phone, name)
    if not cid:
        return False
    print(cf(f"customer criado id={cid} phone={phone}"))

    for i, turn in enumerate(turns, start=1):
        kind = turn["kind"]
        label_ = turn.get("text", "") or turn.get("button_id", "") or turn.get("url", "")[:30]
        print(f"\n  Turno {i}: kind={kind} | {label_}")

        if kind == "text":
            r = fire_text(phone, turn["text"])
        elif kind == "button":
            r = fire_button(phone, turn["button_id"], turn["title"])
        elif kind == "document":
            r = fire_document(phone, turn["url"])
        else:
            continue

        body_str = r.get("body", "") if r["ok"] else r.get("error", "")
        try:
            body = json.loads(body_str)
        except Exception:
            body = {"raw": body_str[:200]}
        mode = body.get("mode") or body.get("msg") or "?"
        v3 = body.get("v3", {})
        print(f"    HTTP {r['elapsed']:.1f}s mode={mode} v3.ok={v3.get('ok')} sent={v3.get('sent')} failed={v3.get('failed')}")

        # delay para dispatcher commitar
        time.sleep(2)
        st = state_for(cid)
        print(f"    state: customer.step={st.get('conversation_step')} cfs={(st.get('cfs') or {}).get('current_step_id')} status={(st.get('cfs') or {}).get('status')} convs={st.get('conv_count')} logs={st.get('log_count')}")

    print()
    print("  conversas:")
    for c in conversations_for(cid):
        d = c.get("message_direction", "?")
        t = c.get("message_type", "?")
        prev = (c.get("message_text") or "").replace("\n", " ")[:70]
        print(f"    {d:8} {t:8} | {prev}")

    viols = violations_for(cid)
    final = state_for(cid)
    if viols:
        print(cf(f"violações G1/G2: {viols}", False))
    else:
        print(cf("zero violações G1/G2"))

    print(f"\n  estado final: {final}")
    return final.get("conv_count", 0) >= 2 and not viols


def main():
    print("=" * 60)
    print("E2E REAL — Fluxo D do super-admin via engine v3")
    print("=" * 60)

    # Verifica flag
    flag_res = rest("GET", "consultants",
                    params=f"id=eq.{SUPER_ADMIN}&select=use_engine_v3")
    flag = isinstance(flag_res, list) and flag_res and flag_res[0].get("use_engine_v3")
    print(cf("flag use_engine_v3=true", bool(flag)))
    if not flag:
        return

    results = []

    results.append((
        "TEST 1 — simular + conta de luz",
        run_scenario(
            "TEST 1 — Lead novo: oi → SIMULAR → conta de luz (PDF real)",
            phone="5500000077777001",
            name="Carlos Teste E2E",
            turns=[
                {"kind": "text", "text": "oi"},
                {"kind": "button", "button_id": "simular", "title": "Quero simular"},
                {"kind": "document", "url": CONTA_REAL_URL},
            ],
        )
    ))

    results.append((
        "TEST 2 — falar com humano",
        run_scenario(
            "TEST 2 — Lead novo: oi → FALAR COM HUMANO",
            phone="5500000077777002",
            name="Maria Teste E2E",
            turns=[
                {"kind": "text", "text": "oi"},
                {"kind": "button", "button_id": "humano", "title": "Falar com Rafael"},
            ],
        )
    ))

    results.append((
        "TEST 3 — texto fora script",
        run_scenario(
            "TEST 3 — Lead novo manda texto que não bate transition",
            phone="5500000077777003",
            name="João Teste E2E",
            turns=[
                {"kind": "text", "text": "oi"},
                {"kind": "text", "text": "qual o preço?"},
            ],
        )
    ))

    results.append((
        "TEST 4 — como funciona",
        run_scenario(
            "TEST 4 — Lead novo: oi → COMO FUNCIONA",
            phone="5500000077777004",
            name="Ana Teste E2E",
            turns=[
                {"kind": "text", "text": "oi"},
                {"kind": "button", "button_id": "como", "title": "Como funciona"},
            ],
        )
    ))

    print("\n" + "=" * 60)
    print("RESUMO FINAL")
    print("=" * 60)
    for name, ok in results:
        print(cf(name, ok))


if __name__ == "__main__":
    main()
