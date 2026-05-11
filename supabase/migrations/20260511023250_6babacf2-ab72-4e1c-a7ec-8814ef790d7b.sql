CREATE TABLE public.feedbacks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID NOT NULL,
  from_user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Positivo','Melhoria','Tecnico')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedbacks_professional ON public.feedbacks(professional_id, created_at DESC);

ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professional views own feedbacks"
ON public.feedbacks FOR SELECT TO authenticated
USING (auth.uid() = professional_id OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Gestores insert feedbacks"
ON public.feedbacks FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gestor') AND from_user_id = auth.uid());

CREATE POLICY "Gestores update feedbacks"
ON public.feedbacks FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Gestores delete feedbacks"
ON public.feedbacks FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'));