
-- Allow all authenticated to see ideas for voting
DROP POLICY IF EXISTS "Author reads own ideas" ON public.ideas;
CREATE POLICY "Authenticated read ideas" ON public.ideas FOR SELECT TO authenticated USING (true);

-- Votes table
CREATE TABLE public.idea_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idea_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.idea_votes TO authenticated;
GRANT ALL ON public.idea_votes TO service_role;

ALTER TABLE public.idea_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read votes" ON public.idea_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own vote" ON public.idea_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users remove own vote" ON public.idea_votes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idea_votes_idea_idx ON public.idea_votes(idea_id);
