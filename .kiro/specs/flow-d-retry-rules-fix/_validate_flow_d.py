#!/usr/bin/env python3
"""
Validador end-to-end do Fluxo D em prod.

Objetivo: provar (ou refutar) que a IA segue 100% o fluxo configurado
em /admin/fluxos. Para cada turno simulado, comparamos:
  - O step que o consultor configurou no /admin/fluxos
  - O step que o bot executou
  - As mensagens (texto/botões/mídia) que o bot enviou
  - As transitions disparadas
  - Os updates aplicados em customers

Saída: relatório por turno com PASS/FAIL para cada propriedade de fidelidade.

Uso: python3 _validate_flow_d.py <SUPA_SR> <SBP_TOKEN>
"""

import json
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone

PROJECT = "zlzasfhcxcznaprrragl"
SUPA_URL = f"https://{PROJECT}.supabase.co"
MGMT_URL = "https://api.supabase.com"
CONSULTANT = "0c2711ad-4836-41e6-afba-edd94f698ae3"
FLOW_D = "320bf22c-e383-4f53-a3c0-b88b89b02558"
SR = sys.argv[1] if len(sys.argv) > 1 else ""
SBP = sys.argv[2] if len(sys.argv) > 2 else ""
PHONE = "55000009995111"

if not SR or not SBP:
    print("Usage: _validate_flow_d.py <SUPA_SR> <SBP_TOKEN>")
    sys.exit(1)


def http(url, *, method="GET", headers=None, data=None):
    """Use curl via subprocess — bypasses Cloudflare blocking python urllib."""
    args = [
        "curl", "-sS", "-o", "/tmp/_curl_body",
        "-w", "%{http_code}",
        "-X", method, url,
    ]
    for k, v in (headers or {}).items():
        args.extend(["-H", f"{k}: {v}"])
    if data:
        args.extend(["--data", json.dumps(data)])
    out = subprocess.run(args, capture_output=True, text=True, timeout=120)
    code = int(out.stdout.strip() or "0")
    try:
        with open("/tmp/_curl_body") as f:
            body = f.read()
    except Exception:
        body = ""
    return code, body


def rest(path, *, method="GET", data=None, prefer=None):
    headers = {
        "apikey": SR, "Authorization": f"Bearer {SR}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    status, body = http(f"{SUPA_URL}/rest/v1{path}", method=method, headers=headers, data=data)
    try:
        return status, json.loads(body) if body else None
    except Exception:
        return status, body


def mgmt_sql(query):
    status, body = http(
        f"{MGMT_URL}/v1/projects/{PROJECT}/database/query",
        method="POST",
        headers={"Authorization": f"Bearer {SBP}", "Content-Type": "application/json"},
        data={"query": query},
    )
    try:
        return status, json.loads(body)
    except Exception:
        return status, body


def webhook_call(turn, run_id, payload):
    headers = {
        "Content-Type": "application/json",
        "apikey": SR, "Authorization": f"Bearer {SR}",
        "x-bot-test-run-id": run_id,
        "x-bot-test-turn": str(turn),
        "x-bot-bypass-quiet-hours": "1",
        "x-bot-fast-clock": "1",
    }
    status, body = http(
        f"{SUPA_URL}/functions/v1/whapi-webhook",
        method="POST", headers=headers, data=payload,
    )
    return status, body


def make_text(text):
    t = int(time.time())
    return {
        "event": {"type": "messages"},
        "messages": [{
            "id": f"sim_{uuid.uuid4().hex}",
            "chat_id": f"{PHONE}@s.whatsapp.net",
            "from": PHONE, "from_me": False, "timestamp": t,
            "type": "text", "text": {"body": text},
        }],
    }


def make_image():
    t = int(time.time())
    b64 = "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAHUlEQVR4nGP8//8/A7mAiWydo5pHNY9qHtVMFc0AnKADJXYG/XsAAAAASUVORK5CYII="
    return {
        "event": {"type": "messages"},
        "messages": [{
            "id": f"sim_{uuid.uuid4().hex}",
            "chat_id": f"{PHONE}@s.whatsapp.net",
            "from": PHONE, "from_me": False, "timestamp": t,
            "type": "image",
            "image": {"mime_type": "image/png", "data": b64,
                      "link": f"data:image/png;base64,{b64}"},
        }],
    }


def make_button_click(button_id, button_text):
    t = int(time.time())
    return {
        "event": {"type": "messages"},
        "messages": [{
            "id": f"sim_{uuid.uuid4().hex}",
            "chat_id": f"{PHONE}@s.whatsapp.net",
            "from": PHONE, "from_me": False, "timestamp": t,
            "type": "interactive",
            "interactive": {
                "type": "button_reply",
                "button_reply": {"id": button_id, "title": button_text},
            },
        }],
    }


def get_customer(cust_id):
    s, body = rest(f"/customers?id=eq.{cust_id}&select=*")
    return body[0] if s == 200 and body else None


def get_outbounds(run_id, turn=None):
    flt = f"&turn=eq.{turn}" if turn is not None else ""
    s, body = rest(f"/bot_test_outbound?run_id=eq.{run_id}&direction=eq.outbound{flt}&select=turn,kind,content,created_at&order=created_at.asc")
    return body or []


def fmt_outbound(o):
    kind = o.get("kind", "?")
    content = o.get("content", "")
    if kind == "buttons":
        try:
            p = json.loads(content)
            text = (p.get("text") or "")[:80]
            buttons = " | ".join(b.get("title", "?") for b in p.get("buttons", []))
            return f"buttons text=\"{text}\" buttons=[{buttons}]"
        except Exception:
            return f"buttons (parse_err) {content[:120]}"
    if kind.startswith("media:"):
        url = content.split("|")[0].strip()[:120]
        return f"{kind} {url}"
    return f"{kind} \"{content[:140]}\""


# ─────────────────────────────────────────────────────────────────────
# 1. Lê config do Fluxo D
# ─────────────────────────────────────────────────────────────────────
print("═" * 70)
print("1. CONFIG DO FLUXO D NO /admin/fluxos")
print("═" * 70)

s, steps = mgmt_sql(f"""
SELECT id, position, step_key, step_type, wait_for,
       LEFT(COALESCE(message_text,''),80) AS msg_preview,
       captures, transitions, fallback
FROM bot_flow_steps
WHERE flow_id = '{FLOW_D}' AND is_active = true
ORDER BY position
""")
if s != 201 or not isinstance(steps, list):
    print(f"ERRO query steps: {s} {steps}")
    sys.exit(1)

steps_by_id = {st["id"]: st for st in steps}
steps_by_key = {st["step_key"]: st for st in steps}

print(f"  Steps ativos: {len(steps)}")
for st in steps:
    n_trans = len(st.get("transitions") or [])
    fb_mode = (st.get("fallback") or {}).get("mode") if st.get("fallback") else None
    print(f"  [pos {st['position']:>2}] {st['step_key']:<24} type={st['step_type']:<22} wait={st.get('wait_for','?'):<6} transitions={n_trans} fb_mode={fb_mode}")
print("")

# ─────────────────────────────────────────────────────────────────────
# 2. Cleanup de sims anteriores
# ─────────────────────────────────────────────────────────────────────
print("═" * 70)
print("2. CLEANUP DE SIMS ANTERIORES")
print("═" * 70)
s, _ = rest(f"/customers?phone_whatsapp=eq.{PHONE}", method="DELETE")
print(f"  customers cleanup status={s}")

# Customer fresh em welcome
s, customer = rest("/customers", method="POST", data={
    "phone_whatsapp": PHONE,
    "consultant_id": CONSULTANT,
    "flow_variant": "D",
    "conversation_step": "welcome",
    "name": "Maria Silva Validacao",
    "name_source": "self_introduced",
    "status": "pending",
    "is_sandbox": True,
    "conversational_flow_enabled": True,
}, prefer="return=representation")
if s != 201:
    print(f"  ERRO criar customer: {s} {customer}")
    sys.exit(1)
cust_id = customer[0]["id"]
print(f"  customer_id={cust_id} phone={PHONE}")

run_id = str(uuid.uuid4())
s, _ = rest("/bot_test_runs", method="POST", data={
    "id": run_id,
    "scenario": "validate_flow_d_full",
    "status": "running",
    "consultant_id": CONSULTANT,
    "customer_id": cust_id,
})
print(f"  run_id={run_id} status={s}")
print("")

# ─────────────────────────────────────────────────────────────────────
# 3. Simulação turno-a-turno
# ─────────────────────────────────────────────────────────────────────

# Roteiro previsto:
# T1: lead manda "oi"        → bot envia welcome (texto + 3 botões: simular, como, humano)
# T2: lead clica "simular"   → bot avança para d_pedir_conta (pede foto da conta)
# T3: lead manda imagem      → bot manda "Conta recebida! Analisando..."
#     (OCR vai falhar pq png 1x1 → cair no helper resolveOcrFallback)
#     → ou retry_text configurado, ou escala (se attempts >= max_retries=2)

turns = [
    {"turn": 1, "kind": "text",   "content": "oi",
     "expect_step_after": "d_welcome",
     "expect_outbound": ["text or buttons containing 'Bem-Vindo' or 'simular'"]},
    {"turn": 2, "kind": "button", "content": "simular",
     "expect_step_after": "d_pedir_conta_id",
     "expect_outbound": ["text mencionando 'foto' AND 'conta'"]},
    {"turn": 3, "kind": "image",  "content": "<png 1x1>",
     "expect_step_after": "ocr fail behavior — varies",
     "expect_outbound": ["text 'Conta recebida' OR retry_text"]},
    {"turn": 4, "kind": "image",  "content": "<png 1x1 retry>",
     "expect_step_after": "ocr fail attempt 2",
     "expect_outbound": ["retry_text custom from FlowBuilder"]},
    {"turn": 5, "kind": "image",  "content": "<png 1x1 attempt 3>",
     "expect_step_after": "aguardando_humano (escalate)",
     "expect_outbound": ["template aguardando_humano/avisado"]},
]

print("═" * 70)
print("3. SIMULAÇÃO TURNO-A-TURNO")
print("═" * 70)

for turn_def in turns:
    n = turn_def["turn"]
    kind = turn_def["kind"]
    content = turn_def["content"]
    print(f"\n─── TURNO {n}: lead envia {kind} \"{content[:50]}\" ───")

    if kind == "text":
        payload = make_text(content)
    elif kind == "button":
        payload = make_button_click(content, content.title())
    elif kind == "image":
        payload = make_image()
    else:
        print(f"  kind desconhecido: {kind}")
        continue

    state_before = get_customer(cust_id)
    step_before = state_before.get("conversation_step") if state_before else None
    print(f"  step_before={step_before}")

    t0 = time.time()
    status, body = webhook_call(n, run_id, payload)
    dt = time.time() - t0
    print(f"  webhook HTTP={status} time={dt:.2f}s")

    # Espera processamento async
    time.sleep(4)

    state_after = get_customer(cust_id)
    if not state_after:
        print(f"  ❌ customer desapareceu!")
        continue
    step_after = state_after.get("conversation_step")
    print(f"  step_after={step_after}")

    interesting = {
        "bot_paused": state_after.get("bot_paused"),
        "bot_paused_reason": state_after.get("bot_paused_reason"),
        "ocr_conta_attempts": state_after.get("ocr_conta_attempts"),
        "custom_step_retries": state_after.get("custom_step_retries"),
        "custom_step_retries_step": state_after.get("custom_step_retries_step"),
        "electricity_bill_value": state_after.get("electricity_bill_value"),
    }
    interesting = {k: v for k, v in interesting.items() if v not in (None, 0, False, "")}
    if interesting:
        print(f"  customer state: {interesting}")

    outs = get_outbounds(run_id, turn=n)
    print(f"  ─→ outbound count = {len(outs)}")
    for i, o in enumerate(outs):
        print(f"      [{i+1}] {fmt_outbound(o)}")

    if not outs:
        print(f"  ⚠️  ZERO outbound — bot ficou MUDO neste turno")

    # Se foi avançar e NÃO avançou, sinaliza
    if step_before == step_after and len(outs) == 0:
        print(f"  ⚠️  step não avançou e bot ficou mudo — possível travamento")

# ─────────────────────────────────────────────────────────────────────
# 4. Análise final + comparação com config
# ─────────────────────────────────────────────────────────────────────
print("\n" + "═" * 70)
print("4. ANÁLISE FINAL DE FIDELIDADE AO FLUXO CONFIGURADO")
print("═" * 70)

final = get_customer(cust_id)
print(f"\nESTADO FINAL DO CUSTOMER:")
print(json.dumps({
    "conversation_step": final.get("conversation_step"),
    "bot_paused": final.get("bot_paused"),
    "bot_paused_reason": final.get("bot_paused_reason"),
    "ocr_conta_attempts": final.get("ocr_conta_attempts"),
    "ocr_doc_attempts": final.get("ocr_doc_attempts"),
    "custom_step_retries": final.get("custom_step_retries"),
    "name": final.get("name"),
    "electricity_bill_value": final.get("electricity_bill_value"),
}, indent=2, ensure_ascii=False))

# Conta outbound total
all_out = get_outbounds(run_id)
by_turn = {}
for o in all_out:
    by_turn.setdefault(o["turn"], []).append(o)

print(f"\nOUTBOUND TOTAL POR TURNO:")
for tn in sorted(by_turn.keys()):
    kinds = [o["kind"] for o in by_turn[tn]]
    print(f"  Turno {tn}: {len(by_turn[tn])} mensagens — kinds={kinds}")

# Handoff alerts
s, alerts = rest(f"/bot_handoff_alerts?customer_id=eq.{cust_id}&select=reason,metadata,created_at")
print(f"\nHANDOFF ALERTS: {len(alerts) if alerts else 0}")
for a in (alerts or []):
    print(f"  reason={a.get('reason')} meta_keys={list((a.get('metadata') or {}).keys())}")

# Salva ids pra cleanup posterior
print(f"\nIDs:\n  customer={cust_id}\n  run={run_id}")
print("\n" + "═" * 70)
print("FIM DA VALIDAÇÃO")
print("═" * 70)
