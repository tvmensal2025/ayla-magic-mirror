-- Padroniza títulos dos passos do Fluxo Padrão (10 passos) em todos os consultores/variantes
WITH target_flows AS (
  SELECT f.id
  FROM bot_flows f
  JOIN bot_flow_steps s ON s.flow_id = f.id
  GROUP BY f.id
  HAVING COUNT(*) FILTER (WHERE s.position BETWEEN 2 AND 11) = 10
     AND BOOL_AND(
       CASE s.position
         WHEN 9  THEN s.step_type = 'capture_conta'
         WHEN 10 THEN s.step_type = 'capture_documento'
         WHEN 11 THEN s.step_type = 'finalizar_cadastro'
         ELSE true
       END
     )
)
UPDATE bot_flow_steps s SET title = CASE s.position
  WHEN 2  THEN '1. Captura do nome'
  WHEN 3  THEN '2. Boas-vindas'
  WHEN 4  THEN '3. Pergunta valor da conta'
  WHEN 5  THEN '4. Explica o desconto'
  WHEN 6  THEN '5. Pede permissão para explicar'
  WHEN 7  THEN '6. Como funciona (áudio + vídeo)'
  WHEN 8  THEN '7. Convite para o cadastro'
  WHEN 9  THEN '8. Conta de luz'
  WHEN 10 THEN '9. Documento com foto'
  WHEN 11 THEN '10. Confirmação e envio'
END,
updated_at = now()
WHERE s.flow_id IN (SELECT id FROM target_flows)
  AND s.position BETWEEN 2 AND 11;