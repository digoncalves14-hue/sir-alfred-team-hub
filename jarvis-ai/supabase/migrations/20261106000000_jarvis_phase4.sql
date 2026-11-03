-- JARVIS AI — Fase 4: conectores empresariais, relatórios e automações controladas pelo usuário.

-- ---------------------------------------------------------------------------
-- Conectores (fontes de dados de cada negócio). O segredo (refresh token) fica
-- CIFRADO e o usuário logado não lê essa coluna. Escrita somente pelo backend.
-- ---------------------------------------------------------------------------
create table if not exists public.jarvis_connectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  space text not null check (space in ('pessoal', 'sir_alfred', 'black_bear', 'barton', 'alfie_fred', 'educacao')),
  type text not null check (type in ('sir_alfred_hub', 'google_sheets')),
  name text not null check (char_length(name) between 1 and 100),
  config jsonb not null default '{}'::jsonb,
  encrypted_secret text,
  account_label text,
  status text not null default 'active' check (status in ('active', 'error')),
  last_error text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jarvis_connectors_user_idx on public.jarvis_connectors (user_id, space);
-- Um único Hub por usuário.
create unique index if not exists jarvis_connectors_one_hub on public.jarvis_connectors (user_id) where type = 'sir_alfred_hub';

-- ---------------------------------------------------------------------------
-- Relatórios gerados (manualmente ou por automação)
-- ---------------------------------------------------------------------------
create table if not exists public.jarvis_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  space text check (space in ('pessoal', 'sir_alfred', 'black_bear', 'barton', 'alfie_fred', 'educacao')),
  kind text not null check (kind in ('relatorio_negocios', 'pendencias', 'tarefas_atrasadas', 'alerta_estoque')),
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists jarvis_reports_user_idx on public.jarvis_reports (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Automações: o USUÁRIO cria, liga/desliga e escolhe dia/horário.
-- run_key evita execução dupla no mesmo período (semana/dia).
-- ---------------------------------------------------------------------------
create table if not exists public.jarvis_automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('relatorio_negocios', 'pendencias', 'tarefas_atrasadas', 'alerta_estoque')),
  space text check (space in ('pessoal', 'sir_alfred', 'black_bear', 'barton', 'alfie_fred', 'educacao')),
  weekday smallint check (weekday between 0 and 6),
  run_time text not null default '08:00' check (run_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  enabled boolean not null default true,
  last_run_key text,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jarvis_automations_enabled_idx on public.jarvis_automations (enabled);

drop trigger if exists jarvis_connectors_touch on public.jarvis_connectors;
create trigger jarvis_connectors_touch before update on public.jarvis_connectors
  for each row execute function public.jarvis_touch_updated_at();
drop trigger if exists jarvis_automations_touch on public.jarvis_automations;
create trigger jarvis_automations_touch before update on public.jarvis_automations
  for each row execute function public.jarvis_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.jarvis_connectors enable row level security;
alter table public.jarvis_reports enable row level security;
alter table public.jarvis_automations enable row level security;

create policy "jarvis_connectors_select_own" on public.jarvis_connectors
  for select to authenticated using (user_id = (select auth.uid()));
create policy "jarvis_connectors_delete_own" on public.jarvis_connectors
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "jarvis_reports_select_own" on public.jarvis_reports
  for select to authenticated using (user_id = (select auth.uid()));
create policy "jarvis_reports_delete_own" on public.jarvis_reports
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "jarvis_automations_all_own" on public.jarvis_automations
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.jarvis_connectors, public.jarvis_reports, public.jarvis_automations from anon;
revoke all on public.jarvis_connectors from authenticated;
grant select (id, user_id, space, type, name, config, account_label, status, last_error, last_sync_at, created_at, updated_at)
  on public.jarvis_connectors to authenticated;
grant delete on public.jarvis_connectors to authenticated;
grant select, delete on public.jarvis_reports to authenticated;
grant select, insert, update, delete on public.jarvis_automations to authenticated;
