CREATE OR REPLACE FUNCTION public.tg_notify_feedback_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE pro uuid; sender uuid; pro_name text;
BEGIN
  SELECT f.professional_id, f.from_user_id INTO pro, sender FROM public.feedbacks f WHERE f.id = NEW.feedback_id;

  IF NEW.author_id = pro THEN
    SELECT p.nome INTO pro_name FROM public.profiles p WHERE p.id = pro;

    INSERT INTO public.notifications (user_id, kind, title, body, tab)
    SELECT DISTINCT ur.user_id, 'feedback',
      COALESCE(pro_name, 'Um profissional') || ' respondeu um feedback',
      left(NEW.content, 140), 'feedbacks'
    FROM public.user_roles ur
    WHERE ur.role = 'gestor'::public.app_role AND ur.user_id <> NEW.author_id;

    IF sender IS NOT NULL AND sender <> NEW.author_id
       AND NOT public.has_role(sender, 'gestor'::public.app_role) THEN
      PERFORM public.notify_one(sender, 'feedback', 'Resposta a um feedback', left(NEW.content, 140), 'feedbacks');
    END IF;
  ELSE
    IF pro IS NOT NULL AND pro <> NEW.author_id THEN
      PERFORM public.notify_one(pro, 'feedback', 'Nova resposta no seu feedback', left(NEW.content, 140), 'notas');
    END IF;
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.tg_notify_feedback_reply() FROM PUBLIC;