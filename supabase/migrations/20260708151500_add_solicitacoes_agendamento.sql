-- Pedidos de agendamento capturados pelo chatbot de clientes.
-- Enquanto a integração com o AppBarber não confirma horário automaticamente,
-- o chatbot registra aqui o pedido para a equipe confirmar manualmente.
CREATE TABLE public.solicitacoes_agendamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  unidade public.unidade NOT NULL,
  servico TEXT NOT NULL,
  preferencia TEXT NOT NULL,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'novo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.solicitacoes_agendamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores view solicitacoes"
  ON public.solicitacoes_agendamento FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Gestores update solicitacoes"
  ON public.solicitacoes_agendamento FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));

-- Inserção é feita pela Edge Function customer-chat com a service role key,
-- por isso não existe policy de INSERT para anon/authenticated.
