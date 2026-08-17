CREATE TABLE public.feedback_replies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feedback_id uuid NOT NULL REFERENCES public.feedbacks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.feedback_replies TO authenticated;
GRANT ALL ON public.feedback_replies TO service_role;

ALTER TABLE public.feedback_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver respostas dos proprios feedbacks ou gestor"
ON public.feedback_replies FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.feedbacks f WHERE f.id = feedback_id AND f.professional_id = auth.uid())
);

CREATE POLICY "Responder feedback proprio ou gestor"
ON public.feedback_replies FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.feedbacks f WHERE f.id = feedback_id AND f.professional_id = auth.uid())
  )
);

CREATE POLICY "Apagar propria resposta ou gestor"
ON public.feedback_replies FOR DELETE TO authenticated
USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE OR REPLACE FUNCTION public.tg_notify_feedback_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE pro uuid; sender uuid;
BEGIN
  SELECT f.professional_id, f.from_user_id INTO pro, sender FROM public.feedbacks f WHERE f.id = NEW.feedback_id;
  IF NEW.author_id = pro THEN
    IF sender IS NOT NULL AND sender <> NEW.author_id THEN
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

CREATE TRIGGER notify_feedback_reply
AFTER INSERT ON public.feedback_replies
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_feedback_reply();

ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_replies;