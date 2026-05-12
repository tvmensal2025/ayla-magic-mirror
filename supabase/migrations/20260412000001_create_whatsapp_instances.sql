-- =====================================================
-- MIGRATION: Criar tabela whatsapp_instances
-- Descrição: Armazena instâncias Evolution API por consultor
-- Data: 2026-04-12
-- =====================================================

-- 1. Criar tabela whatsapp_instances
CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL UNIQUE,
  phone_number TEXT,
  api_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  webhook_url TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected', -- disconnected, connecting, connected, error
  qr_code TEXT,
  qr_code_updated_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Comentários
COMMENT ON TABLE whatsapp_instances IS 'Instâncias WhatsApp Evolution API por consultor';
COMMENT ON COLUMN whatsapp_instances.instance_name IS 'Nome único da instância (ex: consultor-uuid)';
COMMENT ON COLUMN whatsapp_instances.status IS 'Status: disconnected, connecting, connected, error';
COMMENT ON COLUMN whatsapp_instances.qr_code IS 'QR Code em base64 para conexão';

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_consultant 
  ON whatsapp_instances(consultant_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_status 
  ON whatsapp_instances(status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_instance_name 
  ON whatsapp_instances(instance_name);

-- 4. Trigger para updated_at
CREATE TRIGGER set_whatsapp_instances_updated_at
  BEFORE UPDATE ON whatsapp_instances
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 5. RLS (Row Level Security)
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;

-- Consultores podem ver suas próprias instâncias
CREATE POLICY "Consultants can view own instances"
  ON whatsapp_instances FOR SELECT
  USING (consultant_id = auth.uid());

-- Consultores podem inserir suas próprias instâncias
CREATE POLICY "Consultants can insert own instances"
  ON whatsapp_instances FOR INSERT
  WITH CHECK (consultant_id = auth.uid());

-- Consultores podem atualizar suas próprias instâncias
CREATE POLICY "Consultants can update own instances"
  ON whatsapp_instances FOR UPDATE
  USING (consultant_id = auth.uid());

-- Consultores podem deletar suas próprias instâncias
CREATE POLICY "Consultants can delete own instances"
  ON whatsapp_instances FOR DELETE
  USING (consultant_id = auth.uid());

-- Admins podem ver todas as instâncias
CREATE POLICY "Admins can view all instances"
  ON whatsapp_instances FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- Admins podem atualizar todas as instâncias
CREATE POLICY "Admins can update all instances"
  ON whatsapp_instances FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

-- 6. Adicionar campo whatsapp_instance_id em customers
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS whatsapp_instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL;

-- Comentário
COMMENT ON COLUMN customers.whatsapp_instance_id IS 'Instância WhatsApp que atende este cliente';

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_customers_whatsapp_instance 
  ON customers(whatsapp_instance_id);

-- 7. Adicionar campo instance_name em conversations (para rastreamento)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS instance_name TEXT;

COMMENT ON COLUMN conversations.instance_name IS 'Nome da instância que enviou/recebeu a mensagem';

CREATE INDEX IF NOT EXISTS idx_conversations_instance_name 
  ON conversations(instance_name);
