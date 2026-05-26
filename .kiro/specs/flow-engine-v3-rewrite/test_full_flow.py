#!/usr/bin/env python3
"""
Teste FULL do Fluxo D: simula um lead novo passando pelo fluxo completo.
Valida que cada step renderiza o que está configurado (texto + áudio +
vídeo + imagem na ordem definida pelo consultor).
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


def turn_call(payload, run_id, turn_num):
    h = {"Authorization": f"Bearer {ANON}", "apikey": ANON, "Content-Type": "application/json",
         "x-bot-test-run-id": run_id, "x-bot-test-turn": str(turn_num),
         "x-bot-bypass-quiet-hours": "1", "x-bot-fast-clock": "1"}
    req = urllib.request.Request(
        f"https://{PROJECT_REF}.supabase.co/functions/v1/whapi-webhook",
        headers=h, data=json.dumps(payload).encode(),
    )
    t0 = time.time()
    try:
        body = urllib.request.urlopen(req, timeout=120).read().decode()
        return {"elapsed": time.time() - t0, "body": body}
    except Exception as e:
        return {"elapsed": time.time() - t0, "error": str(e)}


def fire_text(phone, text, run_id, turn_num):
    ts = int(time.time())
    return turn_call({
        "messages": [{
            "id": f"sim_{ts}_{uuid.uuid4().hex[:6]}", "from_me": False, "type": "text",
            "chat_id": f"{phone}@s.whatsapp.net", "from": phone,
            "timestamp": ts, "from_name": "Sandbox", "text": {"body": text},
        }],
        "event": {"type": "messages"},
    }, run_id, turn_num)


def fire_button(phone, button_id, title, run_id, turn_num):
    ts = int(time.time())
    return turn_call({
        "messages": [{
            "id": f"sim_{ts}_{uuid.uuid4().hex[:6]}", "from_me": False, "type": "reply",
            "chat_id": f"{phone}@s.whatsapp.net", "from": phone,
            "timestamp": ts, "from_name": "Sandbox",
            "reply": {"type": "buttons_reply",
                       "buttons_reply": {"id": button_id, "title": title}},
        }],
        "event": {"type": "messages"},
    }, run_id, turn_num)


def main():
    print("=" * 60)
    print("TESTE FULL — Fluxo D do início ao fim")
    print("=" * 60)

    # Reset
    rest("DELETE", "customer_flow_state", params=f"customer_id=eq.{SANDBOX_CUSTOMER}")
    rest("PATCH", "customers", body={
        "conversation_step": None, "capture_mode": "auto", "bot_paused": False,
        "flow_variant": "D", "name": "Simulador Sandbox",
    }, params=f"id=eq.{SANDBOX_CUSTOMER}")

    run_id = str(uuid.uuid4())
    rest("POST", "bot_test_runs", body={
        "id": run_id, "status": "running",
        "customer_id": SANDBOX_CUSTOMER,
        "consultant_id": SUPER_ADMIN,
        "scenario": "full_flow_test",
        "created_by": "00000000-0000-0000-0000-000000000000",
    })
    print(f"  run criado: {run_id}\n")

    turns = [
        ("Turn 1: 'oi' (entrar no welcome)", "fire_text", "oi"),
        ("Turn 2: botão 'como' (ir pra como_funciona — TEM ÁUDIO+VÍDEO)", "fire_button", ("como", "Como funciona")),
    ]

    for i, (label, fn, arg) in enumerate(turns, start=1):
        print(f"  >>> {label}")
        if fn == "fire_text":
            r = fire_text(SANDBOX_PHONE, arg, run_id, i)
        else:
            r = fire_button(SANDBOX_PHONE, arg[0], arg[1], run_id, i)
        body_str = r.get("body", "") or r.get("error", "")
        try:
            body = json.loads(body_str)
        except Exception:
            body = {}
        v3 = body.get("v3", {})
        print(f"      HTTP {r.get('elapsed', 0):.1f}s ok={v3.get('ok')} sent={v3.get('sent')} failed={v3.get('failed')}")
        time.sleep(2)

    # Mostra todos os outbounds
    rows = rest("GET", "bot_test_outbound",
                params=f"run_id=eq.{run_id}&order=created_at.asc")
    print(f"\n  Conteudo do simulador ({len(rows) if isinstance(rows, list) else 0} eventos):")
    if isinstance(rows, list):
        for r in rows:
            content = r.get("content") or ""
            kind = r.get("kind")
            turn = r.get("turn")
            # Para mídia, mostra apenas o tipo + preview do label/url
            if kind in ("audio", "image", "video", "document"):
                preview = content[:80].replace("\n", " ")
                print(f"    turn={turn} kind={kind:8} | {preview}")
            elif kind == "buttons":
                # Tenta extrair só o número de botões
                try:
                    parsed = json.loads(content)
                    txt = (parsed.get("text") or "")[:50].replace("\n", " ")
                    btns = parsed.get("buttons", [])
                    print(f"    turn={turn} kind=buttons  | {txt} [+{len(btns)} botões]")
                except Exception:
                    print(f"    turn={turn} kind=buttons  | {content[:60].replace(chr(10), ' ')}")
            else:
                txt = content[:80].replace("\n", " ")
                print(f"    turn={turn} kind={kind:8} | {txt}")

    state = rest("GET", "customers", params=f"id=eq.{SANDBOX_CUSTOMER}&select=conversation_step,bot_paused,capture_mode")
    print(f"\n  estado final: {state}")


if __name__ == "__main__":
    main()
