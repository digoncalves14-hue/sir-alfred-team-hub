# DATABASE — Sir Alfred Platform

Status: Fase 2. Última atualização: 2026-08-10.
Banco: PostgreSQL 17 (Supabase). Convenções: UUID PK (`gen_random_uuid()`),
`created_at`/`updated_at` em toda tabela mutável, soft delete via
`deleted_at NULLABLE` onde a entidade tem valor histórico (não apagar
faturamento, agendamento, cliente), RLS habilitado em 100% das tabelas novas.

## 1. Tabelas pré-existentes (Team Hub — não alteradas nesta fase)

`profiles`, `user_roles` (+ enums `app_role`, `unidade`, `categoria`),
`announcements`, `award_catalog_photos`, `behavioral_profiles`,
`best_practice_posts/comments/likes`, `check_ins`, `checkin_rules`,
`user_checkin_rules`, `client_reviews`, `feedbacks`, `idea_votes`, `ideas`,
`notifications`, `payment_receipts`, `performance_snapshots`,
`product_sales_snapshots`, `social_posts_snapshots`, `pulses`,
`push_subscriptions`, `timeline_events`, `appbarber_config`,
`appbarber_credentials`.

Essas tabelas continuam servindo o Team Hub. `unidade` (enum: Birigui,
Aracatuba, Penapolis, Kids) é a modelagem antiga de "unidade" — a nova
tabela `branches` (§2) é a fonte de verdade daqui para frente; a migração
inicial faz o *seed* de `branches` a partir desses mesmos quatro valores e
liga os `staff_members` aos usuários que já existem, para não exigir
recadastro.

## 2. Núcleo multiempresa/RBAC — **IMPLEMENTADO nesta fase**

```
companies 1───* branches
companies 1───* roles ──* role_permissions *── permissions (catálogo global)
companies 1───* staff_members ──* (user_id → auth.users, branch_id → branches, role_id → roles)
companies 1───* customers
companies 1───* services ──* professional_services ──* staff_members
companies 1───* audit_logs
companies 1───* settings (chave/valor)
```

### companies
Empresa cliente da plataforma (tenant).
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| name | text | nome fantasia |
| legal_name | text null | razão social |
| cnpj | text null | |
| phone / whatsapp / email | text null | |
| logo_url | text null | |
| primary_color | text null | identidade visual (hex) |
| timezone | text | default `America/Sao_Paulo` |
| plan | enum `company_plan` (`starter,pro,business,enterprise`) | preparação Fase 10 |
| status | enum `company_status` (`trial,active,suspended,cancelled`) | preparação Fase 10 |
| created_at/updated_at/deleted_at | timestamptz | |

### branches
Unidade física de uma empresa.
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK companies | |
| name, slug | text | `unique(company_id, slug)` |
| address, city, state, zip_code | text null | |
| phone, whatsapp | text null | |
| timezone | text null | herda da empresa se nulo |
| status | text (`active`/`inactive`) | |
| created_at/updated_at/deleted_at | timestamptz | |

### roles
Papel dentro de uma empresa (RBAC).
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK companies | |
| slug | text | `owner,admin,manager,receptionist,professional,finance,...` |
| name | text | rótulo exibido |
| is_system | boolean | papéis seed não podem ser apagados |
| created_at | timestamptz | |
`unique(company_id, slug)`

### permissions
Catálogo global de capacidades (não pertence a uma empresa).
| coluna | tipo |
|---|---|
| id | uuid PK |
| code | text unique — ex. `agenda.manage`, `finance.view` |
| module | text — ex. `agenda`, `finance`, `customers` |
| description | text |

### role_permissions
| coluna | tipo |
|---|---|
| role_id | uuid FK roles |
| permission_id | uuid FK permissions |
PK composta `(role_id, permission_id)`.

### staff_members
Vínculo de um usuário autenticado com uma empresa (RBAC + escopo).
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK auth.users | |
| company_id | uuid FK companies | |
| branch_id | uuid FK branches null | null = acesso a todas as unidades da empresa |
| role_id | uuid FK roles | |
| status | text (`active`/`inactive`) | |
| created_at/updated_at/deleted_at | timestamptz | |
`unique(user_id, company_id, branch_id)` — evita vínculo duplicado.

### customers
Cliente final da barbearia (comprador do serviço, não usuário do sistema).
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK companies | |
| origin_branch_id | uuid FK branches null | unidade de origem |
| preferred_professional_id | uuid FK staff_members null | |
| name | text | |
| phone, whatsapp, email | text null | |
| birthdate | date null | |
| gender | text null | opcional |
| cpf | text null | opcional |
| notes | text null | |
| tags | text[] | |
| created_at/updated_at/deleted_at | timestamptz | |
Índice em `(company_id, phone)` para busca rápida.

### services
Catálogo de serviços.
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK companies | |
| branch_id | uuid FK branches null | null = disponível em toda a empresa |
| category | text null | |
| name | text | |
| description | text null | |
| duration_minutes | int | > 0 |
| price | numeric(10,2) | >= 0 |
| promo_price | numeric(10,2) null | |
| buffer_minutes | int | intervalo pós-serviço, default 0 |
| commission_type | text (`percentage`/`fixed`) null | |
| commission_value | numeric(10,2) null | |
| active | boolean | default true |
| created_at/updated_at/deleted_at | timestamptz | |

### professional_services
Quais profissionais executam quais serviços.
| coluna | tipo |
|---|---|
| professional_id | uuid FK staff_members |
| service_id | uuid FK services |
PK composta `(professional_id, service_id)`.

### audit_logs
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK companies | |
| user_id | uuid FK auth.users null | |
| action | text | ex. `update`, `delete`, `discount_applied` |
| entity_type | text | ex. `service`, `branch` |
| entity_id | uuid null | |
| old_value | jsonb null | |
| new_value | jsonb null | |
| ip_address | text null | preenchido quando a escrita passa por Edge Function |
| created_at | timestamptz | |
Índice em `(company_id, created_at desc)`.

### settings
Configurações chave/valor por empresa (cancelamento, sinal, feriados, etc.).
| coluna | tipo |
|---|---|
| company_id | uuid FK companies |
| key | text |
| value | jsonb |
| updated_at | timestamptz |
PK composta `(company_id, key)`.

## 3. Funções e segurança (implementadas)

- `public.is_company_member(_user_id uuid, _company_id uuid) returns boolean`
  — `SECURITY DEFINER`, usada em toda policy de `SELECT`.
- `public.has_permission(_user_id uuid, _company_id uuid, _code text) returns boolean`
  — `SECURITY DEFINER`, junta `staff_members → roles → role_permissions → permissions`.
- `public.user_company_ids(_user_id uuid) returns setof uuid` — lista de
  empresas às quais o usuário pertence (usada para telas de seleção de
  empresa).
- Reaproveita `public.set_updated_at()` já existente para os `updated_at`
  das tabelas novas.

RLS: toda tabela do núcleo segue o padrão
`SELECT` → `is_company_member`; `INSERT/UPDATE/DELETE` → `has_permission`
com o código do módulo correspondente (`settings.manage`, `team.manage`,
`customers.manage`, `services.manage`).

## 4. Seed da migração inicial

- 1 `company` bootstrap: **Sir Alfred Barber Club**.
- 4 `branches`: Birigui, Araçatuba, Penápolis, Kids (a partir do enum
  `unidade` existente).
- 6 `roles` seed: owner, admin, manager, receptionist, professional, finance.
- Catálogo inicial de `permissions` (módulos: settings, team, customers,
  services, agenda, finance, reports) e `role_permissions` correspondentes.
- `staff_members`: todo usuário com `user_roles.role = 'gestor'` vira
  `owner` da empresa bootstrap (sem unidade fixa); todo usuário com
  `role = 'profissional'` vira `professional`, vinculado à `branch`
  correspondente ao seu `profiles.unidade` quando existir correspondência.

## 5. Schema-alvo completo (planejado, fases futuras)

As entidades abaixo estão **especificadas** (nomes, papel, relacionamentos)
para orientar as próximas fases, mas **não existem no banco ainda**:

| Entidade | Fase | Relaciona-se com |
|---|---|---|
| `professional_schedules` (jornada) | 5 | staff_members |
| `schedule_blocks` (folga/bloqueio/férias) | 5 | staff_members, branches |
| `holidays` | 5 | branches |
| `appointments` | 5 | customers, staff_members, branches |
| `appointment_services` | 5 | appointments, services |
| `products` | 6 | companies, branches |
| `inventory` | 6 | products, branches |
| `inventory_movements` | 6 | products, branches |
| `sales` / `sale_items` | 6 | appointments, customers, products, services |
| `payments` | 6 | sales |
| `cash_registers` | 6 | branches |
| `commission_rules` / `commissions` | 6 | staff_members, services, products |
| `financial_categories` | 7 | companies |
| `expenses` / `revenues` | 7 | financial_categories, branches |
| `plans` / `subscriptions` (SaaS) | 10 | companies |
| `customer_memberships` (clube) | 12 | customers |
| `packages` / `customer_packages` | 13 | services, customers |
| `loyalty_accounts` / `loyalty_transactions` | 14 | customers |
| `vouchers` | 15 | companies, customers |
| `campaigns` | 9 | companies, segmentos de `customers` |
| `reviews` (avaliação pós-atendimento, nova) | 20 | appointments |

O detalhamento completo de colunas dessas entidades será escrito na
migration correspondente de cada fase (evita desenhar hoje um schema que
mudará ao encostar na regra de negócio real, ex.: motor de disponibilidade
de agenda).
