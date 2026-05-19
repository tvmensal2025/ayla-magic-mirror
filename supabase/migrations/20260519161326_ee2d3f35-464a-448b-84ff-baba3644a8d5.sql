UPDATE customers
SET conversation_step = NULL
WHERE consultant_id = '0c2711ad-4836-41e6-afba-edd94f698ae3'
  AND conversation_step = 'welcome'
  AND status IN ('pending','automation_failed')
  AND bot_paused IS NOT TRUE;