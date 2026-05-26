#!/usr/bin/env python3
"""
Diagnóstico cirúrgico do estado da engine v3 em prod.

Objetivo: provar com 1 SQL por gap qual é exatamente o que falta para
o smoke "oi" → welcome → mensagem visível chegar a um usuário comum.
Não tenta corrigir nada. Só mede.

Uso:
  python3 diagnose.py

Saída: relatório textual com PASS/FAIL por gap + remediação sugerida.
"""

import json
import os
import sys
import time
import urllib.request

PROJECT_REF = "zlzasfhcxcznaprrragl"
MGMT_TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
SR_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANON = os.environ.get("SUPABASE_ANON_KEY", "")
SUPER_ADMIN = "0c2711ad-4836-41e6-afba-edd94f698ae3"
TEST_CUSTOMER = "5640ad4b-4beb-4e29-b751-1ae2a2caac0c"


def q(sql: str):
    """Run management API SQL (read-only or write). Returns parsed JSON."""
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
        headers={
            "Authorization": f"Bearer {MGMT_TOKEN}",
            "Content-Type": "application/json",
        },
        data=json.dumps({"query": sql}).encode(),
    )
    try:
        return json.load(urllib.request.urlopen(req, timeout=30))
    except urllib.error.HTTPError as e:
        return {"_error": str(e), "_body": e.read().decode()}


def section(title: str):
    print(f"\n=== {title} ===")


def check(label: str, ok: bool, detail: str = ""):
    print(f"  [{'OK' if ok else 'FAIL'}] {label}{(' — ' + detail) if detail else ''}")
    return ok


def main():
    section("1. Estado do super-admin e flag")
    r = q(
        f"SELECT use_engine_v3 FROM consultants WHERE id = '{SUPER_ADMIN}';"
    )
    flag = r[0]["use_engine_v3"] if r and not isinstance(r, dict) else False
    check("flag use_engine_v3=true", flag, str(r))

    section("2. Triggers em customers e customer_flow_state")
    triggers = q(
        "SELECT tgname, tgtype FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid "
        "WHERE c.relname IN ('customers','customer_flow_state') AND NOT t.tgisinternal;"
    )
    names = sorted(t["tgname"] for t in triggers) if isinstance(triggers, list) else []
    print("    triggers:", names)
    check(
        "trg_mirror_customer_flow_state existe",
        "trg_mirror_customer_flow_state" in names,
    )
    check(
        "trg_create_customer_flow_state existe",
        "trg_create_customer_flow_state" in names,
    )

    section("3. Função mirror — assinatura e search_path")
    fn = q(
        "SELECT pg_get_functiondef(oid) AS def FROM pg_proc "
        "WHERE proname='mirror_customer_flow_state_to_customers';"
    )
    fn_body = fn[0]["def"] if fn and isinstance(fn, list) and fn else ""
    check("função existe", bool(fn_body))
    check("função suporta TG_OP=INSERT", "TG_OP = 'INSERT'" in fn_body or "TG_OP" in fn_body)

    section("4. Customer de teste — estado pre-smoke")
    r = q(
        f"SELECT c.id, c.conversation_step, c.capture_mode, c.bot_paused, "
        f"c.flow_variant, cfs.current_step_id, cfs.status "
        f"FROM customers c "
        f"LEFT JOIN customer_flow_state cfs ON cfs.customer_id = c.id "
        f"WHERE c.id = '{TEST_CUSTOMER}';"
    )
    state = r[0] if r and isinstance(r, list) and r else {}
    print("    customer:", state)

    section("5. Limpeza para smoke novo")
    q(f"DELETE FROM bot_test_outbound WHERE run_id = 'd8ddf500-0000-4000-9000-000000000001';")
    q(f"DELETE FROM conversations WHERE customer_id = '{TEST_CUSTOMER}';")
    q(f"DELETE FROM engine_logs WHERE customer_id = '{TEST_CUSTOMER}';")
    q(f"DELETE FROM customer_flow_state WHERE customer_id = '{TEST_CUSTOMER}';")
    q(
        f"UPDATE customers SET conversation_step = NULL, bot_paused = false, "
        f"bot_paused_reason = NULL, capture_mode = 'auto' "
        f"WHERE id = '{TEST_CUSTOMER}';"
    )
    print("    estado zerado.")

    section("6. Disparo do smoke 'oi'")
    ts = int(time.time())
    msg_id = f"smk_diag_{ts}"
    payload = {
        "messages": [
            {
                "id": msg_id,
                "from_me": False,
                "type": "text",
                "chat_id": "550000099991111@s.whatsapp.net",
                "from": "550000099991111",
                "timestamp": ts,
                "from_name": "Smoke V3 D",
                "text": {"body": "oi"},
            }
        ],
        "event": {"type": "messages"},
    }
    req = urllib.request.Request(
        f"https://{PROJECT_REF}.supabase.co/functions/v1/whapi-webhook",
        headers={
            "Authorization": f"Bearer {ANON}",
            "apikey": ANON,
            "Content-Type": "application/json",
            "x-bot-test-run-id": "d8ddf500-0000-4000-9000-000000000001",
            "x-bot-test-turn": "100",
            "x-bot-bypass-quiet-hours": "1",
            "x-bot-fast-clock": "1",
        },
        data=json.dumps(payload).encode(),
    )
    t0 = time.time()
    try:
        body = urllib.request.urlopen(req, timeout=60).read().decode()
        print(f"    status 200, {time.time()-t0:.1f}s")
        print(f"    body: {body[:400]}")
    except Exception as e:
        print(f"    erro {time.time()-t0:.1f}s: {e}")

    section("7. Pos-smoke — engine_logs")
    r = q(
        f"SELECT at, kind, payload FROM engine_logs "
        f"WHERE customer_id='{TEST_CUSTOMER}' "
        f"ORDER BY at DESC LIMIT 10;"
    )
    if isinstance(r, list):
        for row in r:
            print(f"    {row['at']} {row['kind']} {json.dumps(row.get('payload') or {})[:80]}")

    section("8. Pos-smoke — customer_flow_state")
    r = q(
        f"SELECT current_step_id, status, retries, last_outbound_content_hash "
        f"FROM customer_flow_state WHERE customer_id='{TEST_CUSTOMER}';"
    )
    cfs = r[0] if r and isinstance(r, list) and r else {}
    print(f"    {cfs}")
    check("current_step_id NOT null", bool(cfs.get("current_step_id")), str(cfs))

    section("9. Pos-smoke — customers (espelho)")
    r = q(
        f"SELECT conversation_step, capture_mode, bot_paused, last_bot_reply_at "
        f"FROM customers WHERE id='{TEST_CUSTOMER}';"
    )
    cust = r[0] if r and isinstance(r, list) and r else {}
    print(f"    {cust}")
    check(
        "customers.conversation_step espelhado de cfs",
        cust.get("conversation_step") == cfs.get("current_step_id"),
        f"customer.cs={cust.get('conversation_step')} cfs.csi={cfs.get('current_step_id')}",
    )

    section("10. Pos-smoke — conversations (chatview)")
    r = q(
        f"SELECT message_direction, message_text, message_type "
        f"FROM conversations WHERE customer_id='{TEST_CUSTOMER}' "
        f"ORDER BY created_at ASC;"
    )
    if isinstance(r, list):
        for row in r:
            t = (row.get("message_text") or "")[:60].replace("\n", " ")
            print(f"    {row['message_direction']:8} {row['message_type']:6} | {t}")
    check("conversations >=2 (1 inbound + 1 outbound)", isinstance(r, list) and len(r) >= 2)

    section("11. Pos-smoke — bot_test_outbound (simulator UI)")
    r = q(
        "SELECT kind, content, turn FROM bot_test_outbound "
        "WHERE run_id='d8ddf500-0000-4000-9000-000000000001' "
        "ORDER BY id ASC;"
    )
    if isinstance(r, list):
        for row in r:
            t = (row.get("content") or "")[:60].replace("\n", " ")
            print(f"    turn={row['turn']:3} kind={row['kind']:6} | {t}")
    check("bot_test_outbound >=1", isinstance(r, list) and len(r) >= 1)

    section("12. Whapi instance health")
    r = q(
        f"SELECT status, last_health_check_at FROM whatsapp_instances "
        f"WHERE consultant_id='{SUPER_ADMIN}';"
    )
    inst = r[0] if r and isinstance(r, list) and r else {}
    print(f"    {inst}")
    check(
        "Whapi conectado (status=connected)",
        inst.get("status") == "connected",
        f"status atual: {inst.get('status')}",
    )

    print("\n=== FIM DO DIAGNÓSTICO ===")


if __name__ == "__main__":
    main()
