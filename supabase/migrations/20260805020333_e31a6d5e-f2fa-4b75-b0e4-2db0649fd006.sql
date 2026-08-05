REVOKE ALL ON FUNCTION public.notify_all(text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_one(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_announcement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_feedback() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_idea() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_idea_reply() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_review() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_performance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_award() FROM PUBLIC, anon, authenticated;