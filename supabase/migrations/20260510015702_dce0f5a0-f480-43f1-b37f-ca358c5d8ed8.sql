
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatars are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Gestores manage any avatar"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'gestor'))
WITH CHECK (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'gestor'));
