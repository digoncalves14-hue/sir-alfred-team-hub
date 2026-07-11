ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS data_aniversario date;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, nome, email, telefone, cargo, unidade, categoria, data_admissao, data_aniversario)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'telefone',
    NEW.raw_user_meta_data->>'cargo',
    NULLIF(NEW.raw_user_meta_data->>'unidade','')::public.unidade,
    NULLIF(NEW.raw_user_meta_data->>'categoria','')::public.categoria,
    NULLIF(NEW.raw_user_meta_data->>'data_admissao','')::date,
    NULLIF(NEW.raw_user_meta_data->>'data_aniversario','')::date
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'profissional');

  RETURN NEW;
END;
$function$;