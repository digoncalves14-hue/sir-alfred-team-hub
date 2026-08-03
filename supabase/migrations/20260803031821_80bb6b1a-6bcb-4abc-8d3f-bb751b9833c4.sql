CREATE TABLE public.appbarber_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key text NOT NULL,
  key_hint text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT (id, key_hint, created_at, updated_at) ON public.appbarber_credentials TO authenticated;
GRANT INSERT (id, api_key, key_hint, updated_at), UPDATE (api_key, key_hint, updated_at) ON public.appbarber_credentials TO authenticated;
GRANT ALL ON public.appbarber_credentials TO service_role;

ALTER TABLE public.appbarber_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores podem ver a dica da chave"
ON public.appbarber_credentials FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Gestores podem cadastrar a chave"
ON public.appbarber_credentials FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Gestores podem atualizar a chave"
ON public.appbarber_credentials FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'))
WITH CHECK (public.has_role(auth.uid(), 'gestor'));

CREATE OR REPLACE FUNCTION public.set_appbarber_credentials_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_appbarber_credentials_updated_at
BEFORE UPDATE ON public.appbarber_credentials
FOR EACH ROW EXECUTE FUNCTION public.set_appbarber_credentials_updated_at();