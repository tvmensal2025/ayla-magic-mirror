DELETE FROM conversations WHERE customer_id = '070e36f3-d335-4ba5-87ab-9b621ade05bc';
DELETE FROM customers WHERE id = '070e36f3-d335-4ba5-87ab-9b621ade05bc';
UPDATE customers SET status = 'pending', conversation_step = 'welcome', error_message = NULL WHERE id = '7340db89-3edc-4747-b8d9-4704aac34d7d';