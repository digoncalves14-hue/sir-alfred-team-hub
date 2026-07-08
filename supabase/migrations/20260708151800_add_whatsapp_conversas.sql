-- Histórico das conversas do WhatsApp por telefone, usado pela Edge Function
-- whatsapp-webhook para manter contexto entre mensagens (o webhook do Meta só
-- envia a última mensagem a cada chamada). Acesso só via service role.
CREATE TABLE public.whatsapp_conversas (
  telefone TEXT PRIMARY KEY,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_conversas ENABLE ROW LEVEL SECURITY;
