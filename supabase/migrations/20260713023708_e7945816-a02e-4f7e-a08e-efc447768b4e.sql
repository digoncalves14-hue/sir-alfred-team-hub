-- Vendas de produtos (importadas do 2º Excel do AppBarber)
CREATE TABLE public.product_sales_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_name text NOT NULL,
  period_label text NOT NULL,
  quantity int NOT NULL DEFAULT 0,
  revenue_cents bigint NOT NULL DEFAULT 0,
  top_product text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_sales_snapshots TO authenticated;
GRANT ALL ON public.product_sales_snapshots TO service_role;

ALTER TABLE public.product_sales_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos autenticados podem ver vendas de produtos"
  ON public.product_sales_snapshots FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Gestor gerencia vendas de produtos"
  ON public.product_sales_snapshots FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));

CREATE TRIGGER trg_product_sales_snapshots_updated
  BEFORE UPDATE ON public.product_sales_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Posts em redes sociais (input manual do gestor)
CREATE TABLE public.social_posts_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_name text NOT NULL,
  period_label text NOT NULL,
  posts_count int NOT NULL DEFAULT 0,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_name, period_label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts_snapshots TO authenticated;
GRANT ALL ON public.social_posts_snapshots TO service_role;

ALTER TABLE public.social_posts_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos autenticados podem ver posts"
  ON public.social_posts_snapshots FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Gestor gerencia posts"
  ON public.social_posts_snapshots FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));

CREATE TRIGGER trg_social_posts_snapshots_updated
  BEFORE UPDATE ON public.social_posts_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();