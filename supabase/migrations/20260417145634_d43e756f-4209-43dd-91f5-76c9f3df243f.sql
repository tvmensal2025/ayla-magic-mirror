UPDATE customers 
SET email = NULL, 
    data_nascimento = NULL, 
    conversation_step = 'welcome', 
    status = 'pending', 
    portal_submitted_at = NULL, 
    error_message = NULL,
    document_front_url = NULL,
    document_back_url = NULL,
    document_front_base64 = NULL,
    electricity_bill_photo_url = NULL,
    nome_pai = NULL,
    nome_mae = NULL
WHERE id = 'ec73ef73-c254-4730-83f6-5d4d2efe3999';

-- Limpar emails de consultor que vazaram para outros customers do sync
UPDATE customers 
SET email = NULL 
WHERE email IN (
  SELECT igreen_portal_email FROM consultants WHERE igreen_portal_email IS NOT NULL
);

-- Limpar data_nascimento placeholder em todos os customers
UPDATE customers 
SET data_nascimento = NULL 
WHERE data_nascimento = '2000-01-01' OR data_nascimento LIKE '2000-01-01%';