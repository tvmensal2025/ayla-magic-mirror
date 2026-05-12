
-- Atualizar customer de teste para simular etapas avançadas
UPDATE customers SET 
  conversation_step = 'confirmando_dados_conta',
  name = 'João da Silva Teste',
  address_street = 'Rua dos Testes',
  address_number = '123',
  address_neighborhood = 'Centro',
  address_city = 'São Paulo',
  address_state = 'SP',
  cep = '01310100',
  distribuidora = 'ENEL SP',
  numero_instalacao = '1234567890',
  electricity_bill_value = 350.00,
  electricity_bill_photo_url = 'test://photo.jpg'
WHERE id = 'ad342679-fcb1-4e98-af50-16d215ec4428';

-- Configurar segundo customer para testar etapas de documento
UPDATE customers SET 
  conversation_step = 'ask_tipo_documento',
  name = 'Maria Teste',
  address_street = 'Av Brasil',
  address_number = '456',
  address_neighborhood = 'Jardins',
  address_city = 'São Paulo',
  address_state = 'SP',
  cep = '01430001',
  distribuidora = 'ENEL SP',
  numero_instalacao = '9876543210',
  electricity_bill_value = 280.00,
  electricity_bill_photo_url = 'test://photo2.jpg'
WHERE id = '8a964864-d040-40ae-a0af-30e8b6b84660';
