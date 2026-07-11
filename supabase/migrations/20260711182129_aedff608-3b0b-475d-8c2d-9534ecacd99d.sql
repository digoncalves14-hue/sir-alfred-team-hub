
CREATE TABLE public.ideas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'geral',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'nova',
  manager_reply TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ideas TO authenticated;
GRANT ALL ON public.ideas TO service_role;

ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

-- Author can see their own idea
CREATE POLICY "Author reads own ideas"
  ON public.ideas FOR SELECT
  TO authenticated
  USING (auth.uid() = author_id);

-- Managers can see all ideas
CREATE POLICY "Managers read all ideas"
  ON public.ideas FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));

-- Any authenticated user can submit their own idea
CREATE POLICY "Authenticated submit ideas"
  ON public.ideas FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = author_id);

-- Author can edit their own idea (only while nova)
CREATE POLICY "Author edits own ideas"
  ON public.ideas FOR UPDATE
  TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- Managers can update (status, reply)
CREATE POLICY "Managers update ideas"
  ON public.ideas FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));

-- Author or manager can delete
CREATE POLICY "Author or manager delete ideas"
  ON public.ideas FOR DELETE
  TO authenticated
  USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'gestor'));

CREATE TRIGGER ideas_set_updated_at
  BEFORE UPDATE ON public.ideas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
