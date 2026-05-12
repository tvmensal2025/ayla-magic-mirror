-- 1. Remover instância duplicada (igreen-0c2711ad4836)
DELETE FROM whatsapp_instances WHERE instance_name = 'igreen-0c2711ad4836';

-- 2. Remover deals do consultor duplicado (sem clientes reais)
DELETE FROM crm_deals WHERE consultant_id = '0c2711ad-4836-41e6-afba-edd94f698ae3';

-- 3. Remover clientes órfãos (sem consultant_id)
DELETE FROM customers WHERE consultant_id IS NULL;
