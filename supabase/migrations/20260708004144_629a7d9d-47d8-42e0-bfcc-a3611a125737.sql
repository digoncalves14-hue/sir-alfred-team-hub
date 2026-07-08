CREATE TABLE public.award_catalog_photos (
  item_key TEXT PRIMARY KEY,
  photo_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.award_catalog_photos TO authenticated;
GRANT ALL ON public.award_catalog_photos TO service_role;

ALTER TABLE public.award_catalog_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores manage award catalog photos"
ON public.award_catalog_photos
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'gestor'))
WITH CHECK (public.has_role(auth.uid(), 'gestor'));

CREATE TRIGGER award_catalog_photos_updated_at
BEFORE UPDATE ON public.award_catalog_photos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Gestores view award photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'award-photos' AND public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Gestores upload award photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'award-photos' AND public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Gestores update award photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'award-photos' AND public.has_role(auth.uid(), 'gestor'))
WITH CHECK (bucket_id = 'award-photos' AND public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Gestores delete award photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'award-photos' AND public.has_role(auth.uid(), 'gestor'));
