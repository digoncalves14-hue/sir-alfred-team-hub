
CREATE TABLE public.appbarber_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_url text NOT NULL DEFAULT 'https://api.appbarber.com.br',
  endpoints jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appbarber_config TO authenticated;
GRANT ALL ON public.appbarber_config TO service_role;

ALTER TABLE public.appbarber_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gestor read appbarber_config"
  ON public.appbarber_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "gestor write appbarber_config"
  ON public.appbarber_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor'::app_role));

INSERT INTO public.appbarber_config (base_url, endpoints) VALUES (
  'https://api.appbarber.com.br',
  '[
    {"name": "Establishment", "path": "/v1/establishment/data"},
    {"name": "Branches", "path": "/v1/establishment/branches"},
    {"name": "Services (Birigui)", "path": "/v1/services?establishment_code=709052"},
    {"name": "Professionals", "path": "/v1/professionals"}
  ]'::jsonb
);
