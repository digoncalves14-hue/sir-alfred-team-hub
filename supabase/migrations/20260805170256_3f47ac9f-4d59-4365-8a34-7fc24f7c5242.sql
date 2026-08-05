
ALTER TABLE public.feedbacks ADD COLUMN IF NOT EXISTS photo_paths text[] NOT NULL DEFAULT '{}';

CREATE TABLE public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_label text NOT NULL,
  file_path text NOT NULL,
  amount_cents bigint,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_receipts TO authenticated;
GRANT ALL ON public.payment_receipts TO service_role;

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own or manager read receipts" ON public.payment_receipts
FOR SELECT TO authenticated
USING (professional_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "managers insert receipts" ON public.payment_receipts
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "managers update receipts" ON public.payment_receipts
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'))
WITH CHECK (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "managers delete receipts" ON public.payment_receipts
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'));

CREATE TRIGGER payment_receipts_updated_at BEFORE UPDATE ON public.payment_receipts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage: feedback-photos (path prefix = professional_id)
CREATE POLICY "feedback photos read own or manager" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'feedback-photos'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'gestor'))
);

CREATE POLICY "feedback photos managers write" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'feedback-photos' AND public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "feedback photos managers delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'feedback-photos' AND public.has_role(auth.uid(), 'gestor'));

-- Storage: payment-receipts (path prefix = professional_id)
CREATE POLICY "receipts read own or manager" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-receipts'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'gestor'))
);

CREATE POLICY "receipts managers write" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'payment-receipts' AND public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "receipts managers delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'payment-receipts' AND public.has_role(auth.uid(), 'gestor'));
