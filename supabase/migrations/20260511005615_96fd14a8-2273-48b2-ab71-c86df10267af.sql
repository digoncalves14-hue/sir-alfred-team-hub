
CREATE TABLE public.check_ins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  unidade public.unidade NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pontual','atraso_tolerancia','atraso')),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  selfie_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own check-ins" ON public.check_ins
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own check-ins" ON public.check_ins
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Gestores view all check-ins" ON public.check_ins
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'gestor'::app_role));

CREATE INDEX idx_check_ins_user_created ON public.check_ins(user_id, created_at DESC);

-- Storage bucket for selfies
INSERT INTO storage.buckets (id, name, public) VALUES ('checkin-selfies','checkin-selfies', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Selfies publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'checkin-selfies');

CREATE POLICY "Users upload own selfies" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'checkin-selfies' AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Gestores view all selfies" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'checkin-selfies' AND has_role(auth.uid(), 'gestor'::app_role)
  );
