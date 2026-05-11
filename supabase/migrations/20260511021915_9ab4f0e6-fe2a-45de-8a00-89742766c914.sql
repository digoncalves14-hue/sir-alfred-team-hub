CREATE TABLE public.checkin_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unidade public.unidade NOT NULL UNIQUE,
  horario_esperado TIME NOT NULL DEFAULT '09:00',
  tolerancia_minutos INTEGER NOT NULL DEFAULT 10,
  raio_metros INTEGER NOT NULL DEFAULT 150,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.checkin_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view checkin rules"
ON public.checkin_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gestores insert checkin rules"
ON public.checkin_rules FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Gestores update checkin rules"
ON public.checkin_rules FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Gestores delete checkin rules"
ON public.checkin_rules FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'));

CREATE TRIGGER trg_checkin_rules_updated_at
BEFORE UPDATE ON public.checkin_rules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.checkin_rules (unidade, horario_esperado, tolerancia_minutos, raio_metros)
VALUES
  ('Birigui', '09:00', 10, 150),
  ('Aracatuba', '09:00', 10, 150),
  ('Penapolis', '09:00', 10, 150);