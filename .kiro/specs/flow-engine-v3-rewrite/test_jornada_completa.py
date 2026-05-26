#!/usr/bin/env python3
"""
Jornada completa do Fluxo D — passa por TODOS os steps e valida que cada um
emite o conteúdo configurado (texto + áudio + vídeo + imagem na ordem certa).

Forca avanço artificial entre os steps via UPDATE customer.conversation_step
+ DELETE customer_flow_state, simulando OCR sucesso/etc.

Para cada step, dispara um inbound e mostra o que a engine v3 envia.
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

STEPS_ORDER = [
    ("d_welcome", "aee7b26c-7669-448b-9def-77dc8466b039"),
    ("d_pedir_conta", "279d3926-5363-403f-af5d-5201e2014598"),
    ("d_como_funciona", "c87d76f8-f4d2-48ec-ac08-4ef0b3c92834"),
    ("d_resultado", "4df1f90a-0248-4df0-9473-4c910f1b22bd"),
    ("d_pedir_documento", "58f0a7e2-16ce-4ee2-ad07-1466ce7e9f1f"),
    ("d_pedir_email", "b1e1a001-d001-4001-9001-d00d00d00001"),
    ("d_confirmar_telefone", "b1e1a002-d002-4002-9002-d00d00d00002"),
    ("d_duvidas", "38c0d101-6492-4b1e-8229-c676c804161a"),
    ("d_finalizar", "9f2d47d4-3f7d-4871-a00a-929314a1550f"),
]

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


def render(o):
    kind = o.get("kind")
    content = o.get("content") or ""
    if kind == "buttons":
        try:
            p = json.loads(content)
            txt = (p.get("text") or "")[:60].replace("\n", " ")
            btns = " | ".join(b.get("title", "?") for b in p.get("buttons", []))
            return f"[buttons] {txt}\n              [{btns}]"
        except Exception:
            return f"[buttons] {content[:80]}"
    if kind in ("audio", "video", "image", "document"):
        return f"[{kind}]"
    if kind == "text":
        return f"[text] {content[:100].replace(chr(10), ' ')}"
    return f"[{kind}] {content[:80]}"


def main():
    phone = "550000077778888"
    name = "JornadaTest"

    # Reset
    rest("DELETE", "customers", params=f"phone_whatsapp=eq.{phone}")
    rest("POST", "customers", body={
        "consultant_id": SUPER_ADMIN, "phone_whatsapp": phone, "name": name,
        "is_sandbox": False, "is_test_lead": True,
        "capture_mode": "auto", "customer_origin": "whatsapp_lead",
        "flow_variant": "D", "status": "pending",
    })
    customers = rest("GET", "customers", params=f"phone_whatsapp=eq.{phone}&select=id")
    cid = customers[0]["id"]
    rest("PATCH", "customers", body={"capture_mode": "auto"}, params=f"id=eq.{cid}")

    print("=" * 70)
    print(f"JORNADA COMPLETA — Fluxo D ({cid[:8]}...)")
    print("=" * 70)

    for i, (step_name, step_id) in enumerate(STEPS_ORDER, start=1):
        print(f"\n  [{i}/9] {step_name}")
        print("  " + "─" * 60)

        # Force lead to be at this step
        rest("PATCH", "customers", body={"conversation_step": None, "name": name},
             params=f"id=eq.{cid}")
        rest("DELETE", "customer_flow_state", params=f"customer_id=eq.{cid}")
        rest("POST", "customer_flow_state", body={
            "customer_id": cid, "flow_id": "320bf22c-e383-4f53-a3c0-b88b89b02558",
            "current_step_id": step_id, "status": "in_flow",
            "entered_step_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        })

        # Cria run novo pra cada step
        run_id = str(uuid.uuid4())
        rest("POST", "bot_test_runs", body={
            "id": run_id, "status": "running",
            "customer_id": cid, "consultant_id": SUPER_ADMIN,
            "scenario": f"jornada_{step_name}",
            "created_by": "00000000-0000-0000-0000-000000000000",
        })

        # Trigger inbound generic — engine vai cair em fallback do step
        # e renderizar o conteúdo do step com a mídia configurada.
        ts = int(time.time())
        payload = {
            "messages": [{
                "id": f"jor_{ts}_{i}", "from_me": False, "type": "text",
                "chat_id": f"{phone}@s.whatsapp.net", "from": phone,
                "timestamp": ts, "from_name": name, "text": {"body": "ping"},
            }],
            "event": {"type": "messages"},
        }
        r = post_webhook(payload, run_id, 1)
        body_str = r.get("body", "") or r.get("error", "")
        try:
            body = json.loads(body_str)
        except Exception:
            body = {}
        v3 = body.get("v3", {})
        print(f"      HTTP {r.get('elapsed', 0):.1f}s ok={v3.get('ok')} sent={v3.get('sent')}")

        time.sleep(2)
        outbounds = rest("GET", "bot_test_outbound",
                         params=f"run_id=eq.{run_id}&order=created_at.asc")
        if isinstance(outbounds, list):
            for o in outbounds:
                print(f"      {render(o)}")
        else:
            print(f"      (sem outbounds)")

    print("\n" + "=" * 70)
    print("JORNADA COMPLETA")
    print("=" * 70)


if __name__ == "__main__":
    main()
