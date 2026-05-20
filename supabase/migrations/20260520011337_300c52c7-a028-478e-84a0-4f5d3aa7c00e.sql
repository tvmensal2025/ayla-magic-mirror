WITH target_flows AS (
  SELECT f.id
  FROM bot_flows f
  JOIN bot_flow_steps s ON s.flow_id = f.id
  GROUP BY f.id
  HAVING COUNT(*) FILTER (WHERE s.position BETWEEN 1 AND 10) = 10
     AND BOOL_AND(CASE s.position
       WHEN 1 THEN s.step_type='audio_slot'
       WHEN 2 THEN s.step_type='question'
       WHEN 6 THEN s.step_type='media_request'
       WHEN 8 THEN s.step_type='media_request'
       WHEN 10 THEN s.step_type='cadastro'
       ELSE s.step_type='audio_slot' END)
)
UPDATE bot_flow_steps s SET title = CASE s.position
  WHEN 1  THEN '1. Áudio de abertura'
  WHEN 2  THEN '2. Pergunta valor da conta'
  WHEN 3  THEN '3. Áudio explicação do desconto'
  WHEN 4  THEN '4. Áudio como funciona'
  WHEN 5  THEN '5. Áudio convite ao cadastro'
  WHEN 6  THEN '6. Pedido da conta de luz'
  WHEN 7  THEN '7. Áudio confirmando recebimento'
  WHEN 8  THEN '8. Pedido do documento'
  WHEN 9  THEN '9. Áudio final'
  WHEN 10 THEN '10. Confirmação e envio'
END,
updated_at = now()
WHERE s.flow_id IN (SELECT id FROM target_flows)
  AND s.position BETWEEN 1 AND 10;