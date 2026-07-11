
CREATE POLICY "Professionals can view own behavioral profile"
  ON public.behavioral_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = professional_id);

DROP POLICY IF EXISTS "Authenticated read votes" ON public.idea_votes;

CREATE POLICY "Users read own votes"
  ON public.idea_votes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'gestor'));

CREATE OR REPLACE FUNCTION public.get_idea_vote_counts()
RETURNS TABLE (idea_id uuid, votes bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT idea_id, count(*)::bigint AS votes
  FROM public.idea_votes
  GROUP BY idea_id
$$;

GRANT EXECUTE ON FUNCTION public.get_idea_vote_counts() TO authenticated;
