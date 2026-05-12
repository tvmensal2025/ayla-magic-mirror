-- Adicionar campo para armazenar base64 da frente do documento
-- Isso permite usar o base64 no OCR conjunto (frente + verso)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS document_front_base64 TEXT;

COMMENT ON COLUMN customers.document_front_base64 IS 'Base64 da frente do documento (temporário para OCR)';
