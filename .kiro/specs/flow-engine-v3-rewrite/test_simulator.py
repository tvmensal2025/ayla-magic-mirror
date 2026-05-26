#!/usr/bin/env python3
"""
Reproduz EXATAMENTE o fluxo do simulator UI do painel admin:
  1. Insere bot_test_runs row.
  2. Reseta customer sandbox (capture_mode=auto, conversation_step=null, etc).
  3. POSTa pro whapi-webhook com headers x-bot-test-run-id + x-bot-test-turn.
  4. Lê bot_test_outbound do run.

Confirma se o simulador real veria os outbounds da engine v3.
"""
import json
import os
import sys
import time
import uuid
import urllib.request

PROJECT_REF = "zlzasfhcxcznaprrragl"
SR = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
ANON = os.environ.get("SUPABASE_ANON_KEY") or ""
SUPER_ADMIN = "0c2711ad-4836-41e6-afba-edd94f698ae3"
SANDBOX_PHONE = "550000021189303"
SANDBOX_CUSTOMER = "1b346313-7d34-4f07-9043-79282f6b2bf0"

REST = f"https://{PROJECT_REF}.supabase.co/rest/v1"


def rest(method, path, body=None, params=None, repr_=False):
    url = f"{REST}/{path}"
    if params:
        url += "?" + params
    h = {"apikey": SR, "Authorization": f"Bearer {SR}", "Content-Type": "application/json"}
    if repr_:
        h["Prefer"] = "return=representation"
    req = urllib.request.Request(url, method=method, headers=h,
                                  data=json.dumps(body).encode() if body else None)
    try:
        text = urllib.request.urlopen(req, timeout=30).read().decode()
        return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_body": e.read().decode()[:300]}


def turn(phone, body, run_id, turn_num):
    h = {"Authorization": f"Bearer {ANON}", "apikey": ANON, "Content-Type": "application/json",
         "x-bot-test-run-id": run_id, "x-bot-test-turn": str(turn_num),
         "x-bot-bypass-quiet-hours": "1", "x-bot-fast-clock": "1"}
    ts = int(time.time())
    msg_id = f"sim_{ts}_{uuid.uuid4().hex[:6]}"
    payload = {
        "messages": [{
            "id": msg_id, "from_me": False, "type": body["type"],
            "chat_id": f"{phone}@s.whatsapp.net", "from": phone,
            "timestamp": ts, "from_name": "Sandbox",
            **body["payload"],
        }],
        "event": {"type": "messages"},
    }
    req = urllib.request.Request(
        f"https://{PROJECT_REF}.supabase.co/functions/v1/whapi-webhook",
        headers=h, data=json.dumps(payload).encode(),
    )
    t0 = time.time()
    try:
        body_resp = urllib.request.urlopen(req, timeout=120).read().decode()
        return {"elapsed": time.time() - t0, "body": body_resp}
    except Exception as e:
        return {"elapsed": time.time() - t0, "error": str(e)}


def main():
    print("=" * 60)
    print("SIMULADOR REAL — Fluxo D do super-admin")
    print("=" * 60)

    # 1. Reset state
    rest("DELETE", "customer_flow_state", params=f"customer_id=eq.{SANDBOX_CUSTOMER}")
    rest("PATCH", "customers", body={
        "conversation_step": None, "capture_mode": "auto", "bot_paused": False,
        "flow_variant": "D", "name": "Simulador Sandbox",
    }, params=f"id=eq.{SANDBOX_CUSTOMER}")
    print("  [OK] sandbox resetado")

    # 2. Cria run
    run_id = str(uuid.uuid4())
    rest("POST", "bot_test_runs", body={
        "id": run_id, "status": "running",
        "customer_id": SANDBOX_CUSTOMER,
        "consultant_id": SUPER_ADMIN,
        "scenario": "ui_simulator",
        "created_by": "00000000-0000-0000-0000-000000000000",
    })
    print(f"  [OK] run criado: {run_id}")

    # 3. Turn 1: oi
    print("\n  Turn 1: 'oi'")
    r = turn(SANDBOX_PHONE, {"type": "text", "payload": {"text": {"body": "oi"}}}, run_id, 1)
    print(f"    HTTP {r.get('elapsed', 0):.1f}s body={(r.get('body') or r.get('error') or '')[:120]}")

    # 4. Polling bot_test_outbound (igual flow-simulate-run faria)
    time.sleep(1)
    rows = rest("GET", "bot_test_outbound",
                params=f"run_id=eq.{run_id}&order=created_at.asc")
    if isinstance(rows, list):
        print(f"\n  bot_test_outbound do simulador ({len(rows)} eventos):")
        for r in rows:
            t = (r.get("content") or "").replace("\n", " ")[:80]
            print(f"    turn={r['turn']} dir={r['direction']:8} kind={r['kind']:8} | {t}")

    # 5. Turn 2: simular (botão)
    print("\n  Turn 2: botão 'simular'")
    r = turn(SANDBOX_PHONE, {"type": "reply", "payload": {
        "reply": {"type": "buttons_reply", "buttons_reply": {"id": "simular", "title": "Quero simular"}},
    }}, run_id, 2)
    print(f"    HTTP {r.get('elapsed', 0):.1f}s body={(r.get('body') or r.get('error') or '')[:120]}")

    time.sleep(1)
    rows2 = rest("GET", "bot_test_outbound",
                 params=f"run_id=eq.{run_id}&turn=eq.2&order=created_at.asc")
    if isinstance(rows2, list):
        print(f"\n  Turn 2 outbounds ({len(rows2)}):")
        for r in rows2:
            t = (r.get("content") or "").replace("\n", " ")[:80]
            print(f"    kind={r['kind']:8} | {t}")

    # Final state
    state = rest("GET", "customers",
                 params=f"id=eq.{SANDBOX_CUSTOMER}&select=conversation_step,bot_paused,capture_mode")
    cfs = rest("GET", "customer_flow_state",
               params=f"customer_id=eq.{SANDBOX_CUSTOMER}&select=current_step_id,status,retries")
    print("\n  estado final:")
    print(f"    customer: {state}")
    print(f"    flow_state: {cfs}")


if __name__ == "__main__":
    main()
