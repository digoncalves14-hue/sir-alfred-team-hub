CREATE TABLE public.user_checkin_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  horario_esperado TIME NOT NULL DEFAULT '09:00',
  tolerancia_minutos INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_checkin_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own rule"
ON public.user_checkin_rules FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Gestores insert user rules"
ON public.user_checkin_rules FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Gestores update user rules"
ON public.user_checkin_rules FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Gestores delete user rules"
ON public.user_checkin_rules FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'));

CREATE TRIGGER trg_user_checkin_rules_updated_at
BEFORE UPDATE ON public.user_checkin_rules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();