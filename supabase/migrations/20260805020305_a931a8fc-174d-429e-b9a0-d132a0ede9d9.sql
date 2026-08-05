-- Notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  tab text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own notifications read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own notifications update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own notifications delete" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Push subscriptions
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subs" ON public.push_subscriptions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Fan-out helpers
CREATE OR REPLACE FUNCTION public.notify_all(_kind text, _title text, _body text, _tab text, _except uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications (user_id, kind, title, body, tab)
  SELECT p.id, _kind, _title, _body, _tab FROM public.profiles p
  WHERE _except IS NULL OR p.id <> _except;
$$;
REVOKE ALL ON FUNCTION public.notify_all(text, text, text, text, uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.notify_one(_user uuid, _kind text, _title text, _body text, _tab text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications (user_id, kind, title, body, tab)
  VALUES (_user, _kind, _title, _body, _tab);
$$;
REVOKE ALL ON FUNCTION public.notify_one(uuid, text, text, text, text) FROM PUBLIC, anon;

-- Announcements
CREATE OR REPLACE FUNCTION public.tg_notify_announcement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_all('aviso', 'Novo aviso · ' || NEW.type, left(NEW.message, 140), 'avisos', NEW.author_id);
  RETURN NEW;
END; $$;
CREATE TRIGGER notify_announcement AFTER INSERT ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.tg_notify_announcement();

-- Feedbacks (private)
CREATE OR REPLACE FUNCTION public.tg_notify_feedback()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_one(NEW.professional_id, 'feedback', 'Você recebeu um feedback', left(NEW.message, 140), 'inicio');
  RETURN NEW;
END; $$;
CREATE TRIGGER notify_feedback AFTER INSERT ON public.feedbacks FOR EACH ROW EXECUTE FUNCTION public.tg_notify_feedback();

-- Ideas
CREATE OR REPLACE FUNCTION public.tg_notify_idea()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, kind, title, body, tab)
  SELECT ur.user_id, 'ideia', 'Nova ideia na Caixa de Ideias', left(NEW.title, 140), 'ideias'
  FROM public.user_roles ur WHERE ur.role = 'gestor' AND ur.user_id <> NEW.author_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER notify_idea AFTER INSERT ON public.ideas FOR EACH ROW EXECUTE FUNCTION public.tg_notify_idea();

CREATE OR REPLACE FUNCTION public.tg_notify_idea_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.manager_reply IS NOT NULL AND NEW.manager_reply IS DISTINCT FROM OLD.manager_reply THEN
    PERFORM public.notify_one(NEW.author_id, 'ideia', 'A gestão respondeu sua ideia', left(NEW.manager_reply, 140), 'ideias');
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.notify_one(NEW.author_id, 'ideia', 'Sua ideia mudou de status', NEW.title || ' · ' || NEW.status, 'ideias');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER notify_idea_reply AFTER UPDATE ON public.ideas FOR EACH ROW EXECUTE FUNCTION public.tg_notify_idea_reply();

-- Client reviews
CREATE OR REPLACE FUNCTION public.tg_notify_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_all('avaliacao', 'Nova avaliação de cliente',
    NEW.professional_name || ' · ' || NEW.stars || '★' || COALESCE(' · ' || left(NEW.comment, 100), ''), 'avaliacoes', NULL);
  RETURN NEW;
END; $$;
CREATE TRIGGER notify_review AFTER INSERT ON public.client_reviews FOR EACH ROW EXECUTE FUNCTION public.tg_notify_review();

-- Performance snapshots (only the matching professional)
CREATE OR REPLACE FUNCTION public.tg_notify_performance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
  SELECT p.id INTO target FROM public.profiles p
  WHERE lower(trim(p.nome)) = lower(trim(NEW.professional_name)) LIMIT 1;
  IF target IS NOT NULL THEN
    PERFORM public.notify_one(target, 'desempenho', 'Seu desempenho foi atualizado', NEW.period_label, 'metas');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER notify_performance AFTER INSERT ON public.performance_snapshots FOR EACH ROW EXECUTE FUNCTION public.tg_notify_performance();

-- Award photos = new prize registered
CREATE OR REPLACE FUNCTION public.tg_notify_award()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_all('premio', 'Novidade nos Prêmios', 'Confira o prêmio do trimestre', 'premios', NULL);
  RETURN NEW;
END; $$;
CREATE TRIGGER notify_award AFTER INSERT ON public.award_catalog_photos FOR EACH ROW EXECUTE FUNCTION public.tg_notify_award();