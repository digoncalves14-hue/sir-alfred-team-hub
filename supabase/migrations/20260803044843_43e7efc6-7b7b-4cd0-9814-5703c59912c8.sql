CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.client_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_name text NOT NULL,
  stars integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text,
  review_date date NOT NULL DEFAULT current_date,
  created_by uuid REFERENCES auth.users,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_reviews TO authenticated;
GRANT ALL ON public.client_reviews TO service_role;

ALTER TABLE public.client_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe autenticada le avaliacoes"
  ON public.client_reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestores criam avaliacoes"
  ON public.client_reviews FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Gestores editam avaliacoes"
  ON public.client_reviews FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Gestores excluem avaliacoes"
  ON public.client_reviews FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));

CREATE TABLE public.timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_name text NOT NULL,
  event_type text NOT NULL DEFAULT 'conquista',
  title text NOT NULL,
  description text,
  event_date date NOT NULL DEFAULT current_date,
  created_by uuid REFERENCES auth.users,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timeline_events TO authenticated;
GRANT ALL ON public.timeline_events TO service_role;

ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe autenticada le historico"
  ON public.timeline_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestores criam historico"
  ON public.timeline_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Gestores editam historico"
  ON public.timeline_events FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Gestores excluem historico"
  ON public.timeline_events FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));

CREATE TRIGGER update_client_reviews_updated_at
  BEFORE UPDATE ON public.client_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_timeline_events_updated_at
  BEFORE UPDATE ON public.timeline_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();