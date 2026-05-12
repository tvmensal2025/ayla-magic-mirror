
UPDATE customers SET
  cpf = '12345678901',
  rg = 'MG1234567',
  data_nascimento = '15/01/1990',
  document_front_url = 'https://test-doc-front.jpg',
  document_back_url = 'nao_aplicavel',
  conversation_step = 'confirmando_dados_documento'
WHERE id = 'fe7d8747-1680-435b-978e-d5468ce95523';
