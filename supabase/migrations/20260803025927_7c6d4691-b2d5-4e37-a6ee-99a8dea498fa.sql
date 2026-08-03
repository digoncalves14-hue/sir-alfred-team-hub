CREATE POLICY "Professionals insert own behavioral profile"
  ON public.behavioral_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = professional_id);

CREATE POLICY "Professionals update own behavioral profile"
  ON public.behavioral_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = professional_id)
  WITH CHECK (auth.uid() = professional_id);