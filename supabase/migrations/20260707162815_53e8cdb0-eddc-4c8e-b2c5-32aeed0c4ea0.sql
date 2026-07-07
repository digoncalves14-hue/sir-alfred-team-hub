
CREATE TABLE public.behavioral_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  perfil text,
  link text,
  pontos_fortes text,
  pontos_atencao text,
  observacoes text,
  data_teste date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.behavioral_profiles TO authenticated;
GRANT ALL ON public.behavioral_profiles TO service_role;

ALTER TABLE public.behavioral_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores manage behavioral profiles"
  ON public.behavioral_profiles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor'::app_role));

CREATE TRIGGER behavioral_profiles_updated_at
  BEFORE UPDATE ON public.behavioral_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
