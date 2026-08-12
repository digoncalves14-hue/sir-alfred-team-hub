-- ============================================================================
-- Fundação multiempresa / multiunidade / RBAC para a plataforma de gestão
-- de barbearias (substitui o papel do AppBarber como motor de dados).
-- Aditivo: não altera nem remove nenhuma tabela existente do Team Hub.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.company_plan AS ENUM ('starter', 'pro', 'business', 'enterprise');
CREATE TYPE public.company_status AS ENUM ('trial', 'active', 'suspended', 'cancelled');

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_name TEXT,
  cnpj TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  logo_url TEXT,
  primary_color TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  plan public.company_plan NOT NULL DEFAULT 'starter',
  status public.company_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- branches (unidades)
-- ---------------------------------------------------------------------------
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  phone TEXT,
  whatsapp TEXT,
  timezone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (company_id, slug)
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_branches_company ON public.branches(company_id);

-- ---------------------------------------------------------------------------
-- roles (por empresa)
-- ---------------------------------------------------------------------------
CREATE TABLE public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug)
);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_roles_company ON public.roles(company_id);

-- ---------------------------------------------------------------------------
-- permissions (catálogo global)
-- ---------------------------------------------------------------------------
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  description TEXT NOT NULL
);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- role_permissions
-- ---------------------------------------------------------------------------
CREATE TABLE public.role_permissions (
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- staff_members (vínculo usuário ↔ empresa ↔ unidade ↔ papel)
-- ---------------------------------------------------------------------------
CREATE TABLE public.staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (user_id, company_id, branch_id)
);

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_staff_members_company ON public.staff_members(company_id);
CREATE INDEX idx_staff_members_branch ON public.staff_members(branch_id);
CREATE INDEX idx_staff_members_user ON public.staff_members(user_id);

-- ---------------------------------------------------------------------------
-- customers (clientes finais)
-- ---------------------------------------------------------------------------
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  origin_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  preferred_professional_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  birthdate DATE,
  gender TEXT,
  cpf TEXT,
  notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_customers_company ON public.customers(company_id);
CREATE INDEX idx_customers_company_phone ON public.customers(company_id, phone);

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  category TEXT,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  promo_price NUMERIC(10, 2) CHECK (promo_price IS NULL OR promo_price >= 0),
  buffer_minutes INTEGER NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0),
  commission_type TEXT CHECK (commission_type IS NULL OR commission_type IN ('percentage', 'fixed')),
  commission_value NUMERIC(10, 2) CHECK (commission_value IS NULL OR commission_value >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_services_company ON public.services(company_id);
CREATE INDEX idx_services_branch ON public.services(branch_id);

-- ---------------------------------------------------------------------------
-- professional_services
-- ---------------------------------------------------------------------------
CREATE TABLE public.professional_services (
  professional_id UUID NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  PRIMARY KEY (professional_id, service_id)
);

ALTER TABLE public.professional_services ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_logs_company_created ON public.audit_logs(company_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- settings (chave/valor por empresa)
-- ---------------------------------------------------------------------------
CREATE TABLE public.settings (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, key)
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Funções de segurança (SECURITY DEFINER — evitam recursão de RLS)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_company_member(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE user_id = _user_id
      AND company_id = _company_id
      AND status = 'active'
      AND deleted_at IS NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _company_id UUID, _code TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_members sm
    JOIN public.role_permissions rp ON rp.role_id = sm.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE sm.user_id = _user_id
      AND sm.company_id = _company_id
      AND sm.status = 'active'
      AND sm.deleted_at IS NULL
      AND p.code = _code
  )
$$;

CREATE OR REPLACE FUNCTION public.user_company_ids(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT company_id FROM public.staff_members
  WHERE user_id = _user_id AND status = 'active' AND deleted_at IS NULL
$$;

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- companies: membros veem; alteração exige settings.manage. Criação de
-- empresa não é exposta ao client nesta fase (feita via seed/Super Admin
-- futuro), por isso não há policy de INSERT.
CREATE POLICY "Members view own company"
  ON public.companies FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), id));

CREATE POLICY "Admins update own company"
  ON public.companies FOR UPDATE
  TO authenticated
  USING (public.has_permission(auth.uid(), id, 'settings.manage'))
  WITH CHECK (public.has_permission(auth.uid(), id, 'settings.manage'));

-- branches
CREATE POLICY "Members view branches"
  ON public.branches FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins manage branches"
  ON public.branches FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'settings.manage'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'settings.manage'));

-- roles
CREATE POLICY "Members view roles"
  ON public.roles FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins manage roles"
  ON public.roles FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'team.manage'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'team.manage'));

-- permissions: catálogo global, leitura livre para autenticados
CREATE POLICY "Authenticated read permissions catalog"
  ON public.permissions FOR SELECT
  TO authenticated
  USING (true);

-- role_permissions: visível a membros da empresa dona do papel; gestão exige team.manage
CREATE POLICY "Members view role_permissions"
  ON public.role_permissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_id AND public.is_company_member(auth.uid(), r.company_id)
    )
  );

CREATE POLICY "Admins manage role_permissions"
  ON public.role_permissions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_id AND public.has_permission(auth.uid(), r.company_id, 'team.manage')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_id AND public.has_permission(auth.uid(), r.company_id, 'team.manage')
    )
  );

-- staff_members
CREATE POLICY "Members view staff_members"
  ON public.staff_members FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins manage staff_members"
  ON public.staff_members FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'team.manage'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'team.manage'));

-- customers
CREATE POLICY "Members view customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members manage customers"
  ON public.customers FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'customers.manage'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'customers.manage'));

-- services
CREATE POLICY "Members view services"
  ON public.services FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins manage services"
  ON public.services FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'services.manage'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'services.manage'));

-- professional_services
CREATE POLICY "Members view professional_services"
  ON public.professional_services FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = service_id AND public.is_company_member(auth.uid(), s.company_id)
    )
  );

CREATE POLICY "Admins manage professional_services"
  ON public.professional_services FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = service_id AND public.has_permission(auth.uid(), s.company_id, 'services.manage')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = service_id AND public.has_permission(auth.uid(), s.company_id, 'services.manage')
    )
  );

-- audit_logs: leitura restrita a quem administra a empresa; escrita para
-- qualquer membro registrar ações que ele mesmo executou
CREATE POLICY "Admins view audit_logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'settings.manage'));

CREATE POLICY "Members insert own audit_logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND user_id = auth.uid());

-- settings
CREATE POLICY "Members view settings"
  ON public.settings FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins manage settings"
  ON public.settings FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), company_id, 'settings.manage'))
  WITH CHECK (public.has_permission(auth.uid(), company_id, 'settings.manage'));

-- ============================================================================
-- Triggers de updated_at (reaproveita public.set_updated_at já existente)
-- ============================================================================
CREATE TRIGGER companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER branches_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER staff_members_updated_at BEFORE UPDATE ON public.staff_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- Seed: empresa bootstrap "Sir Alfred Barber Club" a partir dos dados atuais
-- ============================================================================

DO $$
DECLARE
  v_company_id UUID;
  v_role_owner UUID;
  v_role_admin UUID;
  v_role_manager UUID;
  v_role_receptionist UUID;
  v_role_professional UUID;
  v_role_finance UUID;
  v_branch_birigui UUID;
  v_branch_aracatuba UUID;
  v_branch_penapolis UUID;
  v_branch_kids UUID;
BEGIN
  INSERT INTO public.companies (name, legal_name, timezone, plan, status)
  VALUES ('Sir Alfred Barber Club', 'Sir Alfred Barber Club', 'America/Sao_Paulo', 'business', 'active')
  RETURNING id INTO v_company_id;

  INSERT INTO public.branches (company_id, name, slug, status)
  VALUES (v_company_id, 'Birigui', 'birigui', 'active') RETURNING id INTO v_branch_birigui;
  INSERT INTO public.branches (company_id, name, slug, status)
  VALUES (v_company_id, 'Araçatuba', 'aracatuba', 'active') RETURNING id INTO v_branch_aracatuba;
  INSERT INTO public.branches (company_id, name, slug, status)
  VALUES (v_company_id, 'Penápolis', 'penapolis', 'active') RETURNING id INTO v_branch_penapolis;
  INSERT INTO public.branches (company_id, name, slug, status)
  VALUES (v_company_id, 'Kids', 'kids', 'active') RETURNING id INTO v_branch_kids;

  INSERT INTO public.roles (company_id, slug, name, is_system) VALUES
    (v_company_id, 'owner', 'Proprietário', true),
    (v_company_id, 'admin', 'Administrador', true),
    (v_company_id, 'manager', 'Gerente', true),
    (v_company_id, 'receptionist', 'Recepção', true),
    (v_company_id, 'professional', 'Profissional', true),
    (v_company_id, 'finance', 'Financeiro', true);

  SELECT id INTO v_role_owner FROM public.roles WHERE company_id = v_company_id AND slug = 'owner';
  SELECT id INTO v_role_admin FROM public.roles WHERE company_id = v_company_id AND slug = 'admin';
  SELECT id INTO v_role_manager FROM public.roles WHERE company_id = v_company_id AND slug = 'manager';
  SELECT id INTO v_role_receptionist FROM public.roles WHERE company_id = v_company_id AND slug = 'receptionist';
  SELECT id INTO v_role_professional FROM public.roles WHERE company_id = v_company_id AND slug = 'professional';
  SELECT id INTO v_role_finance FROM public.roles WHERE company_id = v_company_id AND slug = 'finance';

  -- Catálogo de permissões (global — só insere se ainda não existir)
  INSERT INTO public.permissions (code, module, description) VALUES
    ('settings.manage', 'settings', 'Gerenciar dados da empresa, unidades e configurações'),
    ('team.manage', 'team', 'Gerenciar equipe, papéis e permissões'),
    ('customers.manage', 'customers', 'Cadastrar e editar clientes'),
    ('customers.view', 'customers', 'Visualizar clientes'),
    ('services.manage', 'services', 'Gerenciar catálogo de serviços'),
    ('agenda.manage', 'agenda', 'Gerenciar agenda (criar/editar/cancelar agendamentos)'),
    ('agenda.view', 'agenda', 'Visualizar agenda'),
    ('finance.manage', 'finance', 'Gerenciar contas a pagar/receber e caixa'),
    ('finance.view', 'finance', 'Visualizar relatórios financeiros'),
    ('reports.view', 'reports', 'Visualizar relatórios gerenciais')
  ON CONFLICT (code) DO NOTHING;

  -- owner e admin: acesso total
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_role_owner, id FROM public.permissions;
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_role_admin, id FROM public.permissions;

  -- manager: tudo, exceto configurações da empresa
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_role_manager, id FROM public.permissions WHERE code <> 'settings.manage';

  -- receptionist: agenda e clientes
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_role_receptionist, id FROM public.permissions
  WHERE code IN ('agenda.manage', 'agenda.view', 'customers.manage', 'customers.view');

  -- professional: visualizar agenda e clientes
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_role_professional, id FROM public.permissions
  WHERE code IN ('agenda.view', 'customers.view');

  -- finance: financeiro e relatórios
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_role_finance, id FROM public.permissions
  WHERE code IN ('finance.manage', 'finance.view', 'reports.view');

  -- Migra usuários "gestor" existentes para owner da empresa bootstrap
  INSERT INTO public.staff_members (user_id, company_id, branch_id, role_id, status)
  SELECT DISTINCT ur.user_id, v_company_id, NULL::uuid, v_role_owner, 'active'
  FROM public.user_roles ur
  WHERE ur.role = 'gestor'
  ON CONFLICT (user_id, company_id, branch_id) DO NOTHING;

  -- Migra usuários "profissional" existentes, ligando à unidade pelo profiles.unidade
  -- e distinguindo recepção de barbeiro pela categoria já cadastrada.
  INSERT INTO public.staff_members (user_id, company_id, branch_id, role_id, status)
  SELECT DISTINCT
    ur.user_id,
    v_company_id,
    CASE p.unidade
      WHEN 'Birigui' THEN v_branch_birigui
      WHEN 'Aracatuba' THEN v_branch_aracatuba
      WHEN 'Penapolis' THEN v_branch_penapolis
      WHEN 'Kids' THEN v_branch_kids
      ELSE NULL
    END,
    CASE WHEN p.categoria = 'recepcao' THEN v_role_receptionist ELSE v_role_professional END,
    'active'
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'profissional'
    -- Usuários que também são "gestor" já viraram owner acima; um gestor
    -- pode acumular a role "profissional" no modelo antigo, mas no novo
    -- RBAC o vínculo de owner é o que prevalece.
    AND ur.user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'gestor')
  ON CONFLICT (user_id, company_id, branch_id) DO NOTHING;
END $$;
