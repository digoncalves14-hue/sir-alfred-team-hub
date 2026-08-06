CREATE TABLE public.best_practice_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.best_practice_posts TO authenticated;
GRANT ALL ON public.best_practice_posts TO service_role;
ALTER TABLE public.best_practice_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts_select" ON public.best_practice_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "posts_insert" ON public.best_practice_posts FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "posts_update" ON public.best_practice_posts FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "posts_delete" ON public.best_practice_posts FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role));
CREATE TRIGGER best_practice_posts_updated_at BEFORE UPDATE ON public.best_practice_posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.best_practice_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.best_practice_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.best_practice_likes TO authenticated;
GRANT ALL ON public.best_practice_likes TO service_role;
ALTER TABLE public.best_practice_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "likes_select" ON public.best_practice_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "likes_insert" ON public.best_practice_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "likes_delete" ON public.best_practice_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.best_practice_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.best_practice_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.best_practice_comments TO authenticated;
GRANT ALL ON public.best_practice_comments TO service_role;
ALTER TABLE public.best_practice_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments_select" ON public.best_practice_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "comments_insert" ON public.best_practice_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "comments_delete" ON public.best_practice_comments FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE OR REPLACE FUNCTION public.tg_notify_best_practice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.notify_all('mural', 'Nova dica no Mural de Boas Práticas', left(NEW.title, 140), 'mural', NEW.author_id);
  RETURN NEW;
END; $$;
CREATE TRIGGER notify_best_practice AFTER INSERT ON public.best_practice_posts FOR EACH ROW EXECUTE FUNCTION public.tg_notify_best_practice();

CREATE OR REPLACE FUNCTION public.tg_notify_best_practice_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE owner_id uuid; post_title text;
BEGIN
  SELECT p.author_id, p.title INTO owner_id, post_title FROM public.best_practice_posts p WHERE p.id = NEW.post_id;
  IF owner_id IS NOT NULL AND owner_id <> NEW.author_id THEN
    PERFORM public.notify_one(owner_id, 'mural', 'Comentaram sua dica no Mural', left(NEW.content, 140), 'mural');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER notify_best_practice_comment AFTER INSERT ON public.best_practice_comments FOR EACH ROW EXECUTE FUNCTION public.tg_notify_best_practice_comment();

ALTER PUBLICATION supabase_realtime ADD TABLE public.best_practice_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.best_practice_comments;