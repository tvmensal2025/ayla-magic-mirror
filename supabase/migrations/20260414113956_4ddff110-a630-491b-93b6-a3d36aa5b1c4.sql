
UPDATE customers SET
  conversation_step = 'confirmando_dados_conta',
  name = 'Rafael Ferreira Teste',
  address_street = 'Rua das Palmeiras',
  address_number = '456',
  address_neighborhood = 'Jardim América',
  address_city = 'São Paulo',
  address_state = 'SP',
  cep = '01406100',
  distribuidora = 'ENEL SP',
  numero_instalacao = '3456789012',
  electricity_bill_value = 420.00,
  electricity_bill_photo_url = 'https://test-ocr-photo.jpg'
WHERE id = 'fe7d8747-1680-435b-978e-d5468ce95523';
