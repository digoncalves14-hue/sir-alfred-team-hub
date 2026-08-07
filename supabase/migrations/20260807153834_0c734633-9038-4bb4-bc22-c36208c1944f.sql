CREATE OR REPLACE FUNCTION public.tg_notify_feedback()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.notify_one(NEW.professional_id, 'feedback', 'Você recebeu um feedback', left(NEW.message, 140), 'notas');
  RETURN NEW;
END; $function$;