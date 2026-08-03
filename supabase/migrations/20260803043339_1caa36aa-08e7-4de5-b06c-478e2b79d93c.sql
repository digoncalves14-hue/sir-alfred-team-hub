-- Restrict access to manager replies on ideas (column-level security)
REVOKE SELECT ON public.ideas FROM authenticated;
GRANT SELECT (id, author_id, category, title, description, status, created_at, updated_at) ON public.ideas TO authenticated;
GRANT ALL ON public.ideas TO service_role;

CREATE OR REPLACE FUNCTION public.get_idea_replies()
RETURNS TABLE(idea_id uuid, manager_reply text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT i.id, i.manager_reply
  FROM public.ideas i
  WHERE i.manager_reply IS NOT NULL
    AND (i.author_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role))
$$;

REVOKE ALL ON FUNCTION public.get_idea_replies() FROM public;
GRANT EXECUTE ON FUNCTION public.get_idea_replies() TO authenticated;

-- Owner-scoped delete for check-in selfies storage
CREATE POLICY "Owners delete own checkin selfies"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'checkin-selfies' AND owner = auth.uid());