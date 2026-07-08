-- Services catalog (used by the customer-facing chatbot for FAQ/booking)
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  categoria TEXT,
  preco NUMERIC(10,2) NOT NULL,
  duracao_min INTEGER NOT NULL,
  unidade public.unidade NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active services"
  ON public.services FOR SELECT
  TO anon, authenticated
  USING (ativo = true);

CREATE POLICY "Gestores manage services"
  ON public.services FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));

CREATE TRIGGER services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed: catálogo real de Birigui (fonte: exportação AppBarber, jul/2026)
INSERT INTO public.services (nome, categoria, preco, duracao_min, unidade) VALUES
  ('Corte e Barba', 'Cabelo e Barba', 120.00, 80, 'Birigui'),
  ('Auxílio Noivo', 'Dia do Noivo', 50.00, 40, 'Birigui'),
  ('Barba', 'Barba', 60.00, 40, 'Birigui'),
  ('Barba Dia do Noivo', 'Dia do Noivo', 45.00, 40, 'Birigui'),
  ('Barba Rápida', 'Barba', 40.00, 40, 'Birigui'),
  ('Barboterapia', 'Barba', 65.00, 40, 'Birigui'),
  ('Barboterapia + Raspagem', 'Cabelo e Barba', 75.00, 40, 'Birigui'),
  ('Cabelo', 'Cabelo', 70.00, 40, 'Birigui'),
  ('Cabelo Dia do Noivo', 'Dia do Noivo', 54.00, 40, 'Birigui'),
  ('Camuflagem Fios Brancos', 'Cabelo', 65.00, 40, 'Birigui'),
  ('Consultoria de Visagismo', NULL, 420.00, 120, 'Birigui'),
  ('Corte e Barba Dia do Noivo', 'Dia do Noivo', 90.00, 80, 'Birigui'),
  ('Corte e Barboterapia', 'Cabelo e Barba', 125.00, 80, 'Birigui'),
  ('Corte Express (ajuste do pezinho do cabelo)', 'Cabelo', 35.00, 40, 'Birigui'),
  ('Corte Feminino Infantil', 'Kids', 70.00, 40, 'Birigui'),
  ('Corte Masculino Infantil', 'Kids', 70.00, 40, 'Birigui'),
  ('Curso de Barbeiro', 'Cabelo e Barba', 2499.00, 40, 'Birigui'),
  ('Depilação Nariz', 'Estética', 25.00, 40, 'Birigui'),
  ('Depilação Nariz e Orelhas', 'Estética', 40.00, 40, 'Birigui'),
  ('Depilação Orelhas', 'Estética', 25.00, 40, 'Birigui'),
  ('Dia de Princesa', 'Kids', 140.00, 120, 'Birigui'),
  ('Dia do Noivo', 'Dia do Noivo', 1897.00, 240, 'Birigui'),
  ('Franjinha Feminina Infantil', 'Kids', 30.00, 40, 'Birigui'),
  ('Freestyle', 'Cabelo', 45.00, 40, 'Birigui'),
  ('Hidratação + Escova ou Babyliss (cabelo feminino infantil)', 'Kids', 60.00, 80, 'Birigui'),
  ('Hidratação Cabelo Feminino Infantil', 'Kids', 45.00, 40, 'Birigui'),
  ('Hidratação Keune', NULL, 60.00, 40, 'Birigui'),
  ('Hidratação Keune com Ozônio', 'Cabelo', 80.00, 40, 'Birigui'),
  ('Luzes Inversas', NULL, 100.00, 120, 'Birigui'),
  ('Manicure', 'Estética', 35.00, 40, 'Birigui'),
  ('Manicure e Pedicure', 'Estética', 70.00, 80, 'Birigui'),
  ('Manicure Feminino Infantil', 'Kids', 25.00, 40, 'Birigui'),
  ('Maquiagem Infantil', 'Kids', 50.00, 40, 'Birigui'),
  ('Maquiagem Masculino Adulto', 'Estética', 45.00, 40, 'Birigui'),
  ('Massagem Capilar', NULL, 70.00, 40, 'Birigui'),
  ('Pedicure', 'Estética', 40.00, 40, 'Birigui'),
  ('Pedicure Feminino Infantil', 'Kids', 30.00, 40, 'Birigui'),
  ('Penteado com Lavagem do Cabelo', NULL, 80.00, 80, 'Birigui'),
  ('Penteado Coque', 'Kids', 65.00, 40, 'Birigui'),
  ('Penteados em Geral (sem lavagem do cabelo)', 'Kids', 60.00, 40, 'Birigui'),
  ('Pezinho do Cabelo Dia do Noivo', 'Dia do Noivo', 30.00, 40, 'Birigui'),
  ('Pigmentação na Barba', 'Barba', 35.00, 40, 'Birigui'),
  ('Plástica dos Pés + Pedicure (para calosidade)', NULL, 85.00, 80, 'Birigui'),
  ('Platinado Adulto', 'Cabelo', 200.00, 160, 'Birigui'),
  ('Preenchimento de Barba', NULL, 1180.00, 160, 'Birigui'),
  ('Progressiva Masculina (cabelo curto ou médio)', 'Cabelo', 130.00, 120, 'Birigui'),
  ('Redutor de Volume (cabelo curto ou médio)', NULL, 70.00, 40, 'Birigui'),
  ('Sobrancelha Navalha', 'Estética', 25.00, 40, 'Birigui'),
  ('Sobrancelhas', 'Estética', 35.00, 40, 'Birigui'),
  ('Spa dos Pés + Pedicure (para relaxamento)', NULL, 90.00, 80, 'Birigui');
