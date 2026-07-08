-- Avatars: only owner or manager can list/select via Storage API
DROP POLICY IF EXISTS "Avatars are publicly viewable" ON storage.objects;
CREATE POLICY "Avatars viewable by owner or manager"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'gestor'::app_role)
  )
);

-- Check-in selfies: remove public read and restrict to owner/manager
DROP POLICY IF EXISTS "Selfies publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Gestores view all selfies" ON storage.objects;

CREATE POLICY "Users view own selfies"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'checkin-selfies'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Gestores view all selfies"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'checkin-selfies'
  AND public.has_role(auth.uid(), 'gestor'::app_role)
);