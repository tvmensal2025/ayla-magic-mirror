import json, pathlib
body = pathlib.Path(".tmp/pr2-body.md").read_text(encoding="utf-8")
payload = {
    "title": "feat(flow-engine-v3): rewrite + retry rules carryover + parceiros/cashback/whatsapp polish",
    "body": body,
}
pathlib.Path(".tmp/pr2-payload.json").write_text(json.dumps(payload), encoding="utf-8")
print("ok")
