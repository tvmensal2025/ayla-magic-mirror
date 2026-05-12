ALTER TABLE customers DROP CONSTRAINT customers_status_check;
ALTER TABLE customers ADD CONSTRAINT customers_status_check CHECK (status = ANY (ARRAY['pending','data_complete','registered_igreen','contract_sent','approved','rejected','lead','awaiting_signature','devolutiva']));
UPDATE customers SET status = 'awaiting_signature' WHERE andamento_igreen ILIKE '%falta assinatura%' AND status = 'pending';
UPDATE customers SET status = 'devolutiva' WHERE andamento_igreen ILIKE 'devolutiva' AND status = 'rejected';