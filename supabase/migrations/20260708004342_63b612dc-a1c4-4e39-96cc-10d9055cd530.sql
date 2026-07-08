GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

DROP POLICY IF EXISTS "Gestores manage award catalog photos" ON public.award_catalog_photos;

CREATE POLICY "Authenticated view award catalog photos"
ON public.award_catalog_photos
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Gestores insert award catalog photos"
ON public.award_catalog_photos
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Gestores update award catalog photos"
ON public.award_catalog_photos
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'gestor'))
WITH CHECK (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Gestores delete award catalog photos"
ON public.award_catalog_photos
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'gestor'));

DROP POLICY IF EXISTS "Gestores view award photos" ON storage.objects;

CREATE POLICY "Authenticated view award photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'award-photos');
