
CREATE TABLE public.performance_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_label TEXT NOT NULL,
  professional_name TEXT NOT NULL,
  services_count INTEGER NOT NULL DEFAULT 0,
  comandas_count INTEGER NOT NULL DEFAULT 0,
  revenue_cents BIGINT NOT NULL DEFAULT 0,
  top_service TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_label, professional_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_snapshots TO authenticated;
GRANT ALL ON public.performance_snapshots TO service_role;

ALTER TABLE public.performance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read performance" ON public.performance_snapshots
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "gestor insert performance" ON public.performance_snapshots
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "gestor update performance" ON public.performance_snapshots
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "gestor delete performance" ON public.performance_snapshots
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'gestor'));

CREATE TRIGGER performance_snapshots_updated_at
  BEFORE UPDATE ON public.performance_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
