-- JARVIS AI — configuração completa do banco (Fases 1 a 5), para colar no SQL Editor do Supabase.
-- Gerado a partir de supabase/migrations/. Roda tudo numa transação: se algo falhar, nada é aplicado.

begin;

-- ===== 20261103000000_jarvis_phase1.sql =====
-- JARVIS AI — Fase 1: perfil, conversas, memória, ações pendentes, auditoria e consumo.
-- Todas as tabelas usam Row Level Security: cada usuário só enxerga as próprias linhas.
-- Prefixo "jarvis_" evita colisão com outras tabelas do mesmo projeto Supabase.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Perfil e preferências
-- ---------------------------------------------------------------------------
create table if not exists public.jarvis_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  owner_name text not null default 'senhor' check (char_length(owner_name) between 1 and 60),
  assistant_name text not null default 'Jarvis' check (char_length(assistant_name) between 1 and 30),
  memory_enabled boolean not null default true,
  timezone text not null default 'America/Sao_Paulo',
  daily_cost_limit_usd numeric(10, 4) not null default 1.00 check (daily_cost_limit_usd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Conversas e mensagens
-- ---------------------------------------------------------------------------
create table if not exists public.jarvis_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Nova conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jarvis_conversations_user_updated_idx
  on public.jarvis_conversations (user_id, updated_at desc);

create table if not exists public.jarvis_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.jarvis_conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  input_mode text check (input_mode in ('voice', 'text')),
  tool_events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists jarvis_messages_conversation_idx
  on public.jarvis_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Memória persistente (busca textual em português, sem custo de embeddings)
-- ---------------------------------------------------------------------------
create table if not exists public.jarvis_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null check (category in ('preferencia', 'profissional', 'projeto', 'decisao', 'compromisso', 'outro')),
  space text not null default 'pessoal' check (space in ('pessoal', 'sir_alfred', 'black_bear', 'barton', 'alfie_fred', 'educacao')),
  content text not null check (char_length(content) between 2 and 2000),
  source text not null default 'user' check (source in ('user', 'assistant')),
  search tsvector generated always as (to_tsvector('portuguese', content)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jarvis_memories_user_idx on public.jarvis_memories (user_id, updated_at desc);
create index if not exists jarvis_memories_search_idx on public.jarvis_memories using gin (search);

-- ---------------------------------------------------------------------------
-- Ações que exigem confirmação explícita do usuário
-- ---------------------------------------------------------------------------
create table if not exists public.jarvis_pending_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id uuid references public.jarvis_conversations (id) on delete set null,
  tool_name text not null,
  input jsonb not null,
  summary text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'expired', 'failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  resolved_at timestamptz
);
create index if not exists jarvis_pending_actions_user_idx
  on public.jarvis_pending_actions (user_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Registro de ações (auditoria). Somente inserção e leitura pelo usuário.
-- ---------------------------------------------------------------------------
create table if not exists public.jarvis_action_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tool_name text not null,
  status text not null check (status in ('executed', 'pending', 'confirmed', 'rejected', 'failed', 'blocked')),
  summary text not null,
  input jsonb,
  created_at timestamptz not null default now()
);
create index if not exists jarvis_action_log_user_idx on public.jarvis_action_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Consumo de APIs (controle de custos)
-- ---------------------------------------------------------------------------
create table if not exists public.jarvis_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('chat', 'tts')),
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  characters integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists jarvis_usage_user_created_idx on public.jarvis_usage (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create or replace function public.jarvis_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists jarvis_profiles_touch on public.jarvis_profiles;
create trigger jarvis_profiles_touch before update on public.jarvis_profiles
  for each row execute function public.jarvis_touch_updated_at();
drop trigger if exists jarvis_conversations_touch on public.jarvis_conversations;
create trigger jarvis_conversations_touch before update on public.jarvis_conversations
  for each row execute function public.jarvis_touch_updated_at();
drop trigger if exists jarvis_memories_touch on public.jarvis_memories;
create trigger jarvis_memories_touch before update on public.jarvis_memories
  for each row execute function public.jarvis_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.jarvis_profiles enable row level security;
alter table public.jarvis_conversations enable row level security;
alter table public.jarvis_messages enable row level security;
alter table public.jarvis_memories enable row level security;
alter table public.jarvis_pending_actions enable row level security;
alter table public.jarvis_action_log enable row level security;
alter table public.jarvis_usage enable row level security;

-- Perfil: CRUD apenas da própria linha.
create policy "jarvis_profiles_select_own" on public.jarvis_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "jarvis_profiles_insert_own" on public.jarvis_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "jarvis_profiles_update_own" on public.jarvis_profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Conversas: CRUD próprio.
create policy "jarvis_conversations_all_own" on public.jarvis_conversations
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Mensagens: o usuário só insere em conversas dele.
create policy "jarvis_messages_select_own" on public.jarvis_messages
  for select to authenticated using (user_id = (select auth.uid()));
create policy "jarvis_messages_insert_own" on public.jarvis_messages
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.jarvis_conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );
create policy "jarvis_messages_delete_own" on public.jarvis_messages
  for delete to authenticated using (user_id = (select auth.uid()));

-- Memórias: CRUD próprio (visualizar, corrigir, apagar).
create policy "jarvis_memories_all_own" on public.jarvis_memories
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Ações pendentes: leitura/criação/atualização próprias; sem exclusão (histórico).
create policy "jarvis_pending_select_own" on public.jarvis_pending_actions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "jarvis_pending_insert_own" on public.jarvis_pending_actions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "jarvis_pending_update_own" on public.jarvis_pending_actions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Auditoria: apenas inserir e ler. Sem update/delete (registro imutável para o usuário).
create policy "jarvis_action_log_select_own" on public.jarvis_action_log
  for select to authenticated using (user_id = (select auth.uid()));
create policy "jarvis_action_log_insert_own" on public.jarvis_action_log
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Consumo: apenas inserir e ler.
create policy "jarvis_usage_select_own" on public.jarvis_usage
  for select to authenticated using (user_id = (select auth.uid()));
create policy "jarvis_usage_insert_own" on public.jarvis_usage
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Privilégios: somente o papel "authenticated" (nunca "anon").
revoke all on public.jarvis_profiles, public.jarvis_conversations, public.jarvis_messages,
  public.jarvis_memories, public.jarvis_pending_actions, public.jarvis_action_log, public.jarvis_usage
  from anon;
grant select, insert, update on public.jarvis_profiles to authenticated;
grant select, insert, update, delete on public.jarvis_conversations to authenticated;
grant select, insert, delete on public.jarvis_messages to authenticated;
grant select, insert, update, delete on public.jarvis_memories to authenticated;
grant select, insert, update on public.jarvis_pending_actions to authenticated;
grant select, insert on public.jarvis_action_log to authenticated;
grant select, insert on public.jarvis_usage to authenticated;


-- ===== 20261104000000_jarvis_phase2.sql =====
-- JARVIS AI — Fase 2: integrações (Google), tarefas e lembretes, notificações push, resumo diário.

-- ---------------------------------------------------------------------------
-- Preferências de notificação no perfil
-- ---------------------------------------------------------------------------
alter table public.jarvis_profiles
  add column if not exists daily_summary_enabled boolean not null default true,
  add column if not exists daily_summary_time text not null default '08:00'
    check (daily_summary_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column if not exists meeting_reminder_minutes integer not null default 10
    check (meeting_reminder_minutes between 0 and 120),
  add column if not exists last_summary_date date;

-- ---------------------------------------------------------------------------
-- Integrações OAuth. Os tokens ficam CRIPTOGRAFADOS (AES-256-GCM, chave só no backend)
-- e o usuário autenticado NÃO pode ler a coluna do token (grants por coluna).
-- Escrita somente pelo backend (service_role).
-- ---------------------------------------------------------------------------
create table if not exists public.jarvis_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google')),
  account_email text,
  scopes text[] not null default '{}',
  services text[] not null default '{}',
  encrypted_refresh_token text not null,
  status text not null default 'active' check (status in ('active', 'error', 'revoked')),
  last_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- ---------------------------------------------------------------------------
-- Tarefas e lembretes (próprios do Jarvis; funcionam sem integrações externas)
-- ---------------------------------------------------------------------------
create table if not exists public.jarvis_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  notes text check (char_length(notes) <= 2000),
  space text not null default 'pessoal' check (space in ('pessoal', 'sir_alfred', 'black_bear', 'barton', 'alfie_fred', 'educacao')),
  priority text not null default 'normal' check (priority in ('baixa', 'normal', 'alta')),
  due_date date,
  remind_at timestamptz,
  reminded_at timestamptz,
  status text not null default 'aberta' check (status in ('aberta', 'concluida')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jarvis_tasks_user_status_idx on public.jarvis_tasks (user_id, status, due_date);
create index if not exists jarvis_tasks_reminders_idx on public.jarvis_tasks (remind_at)
  where status = 'aberta' and reminded_at is null and remind_at is not null;

-- ---------------------------------------------------------------------------
-- Tokens de push (Expo Push / APNs) por aparelho
-- ---------------------------------------------------------------------------
create table if not exists public.jarvis_push_tokens (
  token text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists jarvis_push_tokens_user_idx on public.jarvis_push_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Caixa de notificações (o que foi enviado; o app mostra o histórico)
-- dedupe_key garante que o mesmo lembrete/resumo não seja enviado duas vezes.
-- ---------------------------------------------------------------------------
create table if not exists public.jarvis_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('resumo_diario', 'lembrete_tarefa', 'lembrete_reuniao', 'sistema')),
  title text not null,
  body text not null,
  dedupe_key text not null,
  delivered boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index if not exists jarvis_notifications_user_idx on public.jarvis_notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
drop trigger if exists jarvis_integrations_touch on public.jarvis_integrations;
create trigger jarvis_integrations_touch before update on public.jarvis_integrations
  for each row execute function public.jarvis_touch_updated_at();
drop trigger if exists jarvis_tasks_touch on public.jarvis_tasks;
create trigger jarvis_tasks_touch before update on public.jarvis_tasks
  for each row execute function public.jarvis_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.jarvis_integrations enable row level security;
alter table public.jarvis_tasks enable row level security;
alter table public.jarvis_push_tokens enable row level security;
alter table public.jarvis_notifications enable row level security;

-- Integrações: o usuário vê o STATUS das próprias (sem o token). Escrita só pelo backend.
create policy "jarvis_integrations_select_own" on public.jarvis_integrations
  for select to authenticated using (user_id = (select auth.uid()));

-- Tarefas: CRUD próprio.
create policy "jarvis_tasks_all_own" on public.jarvis_tasks
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Push tokens: o usuário registra e remove os próprios aparelhos.
create policy "jarvis_push_tokens_all_own" on public.jarvis_push_tokens
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Notificações: o usuário lê e marca como lidas; a criação é do backend.
create policy "jarvis_notifications_select_own" on public.jarvis_notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "jarvis_notifications_update_own" on public.jarvis_notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.jarvis_integrations, public.jarvis_tasks, public.jarvis_push_tokens, public.jarvis_notifications from anon;
revoke all on public.jarvis_integrations from authenticated;
grant select (id, user_id, provider, account_email, scopes, services, status, last_error, connected_at, updated_at)
  on public.jarvis_integrations to authenticated;
grant select, insert, update, delete on public.jarvis_tasks to authenticated;
grant select, insert, update, delete on public.jarvis_push_tokens to authenticated;
grant select on public.jarvis_notifications to authenticated;
grant update (read_at) on public.jarvis_notifications to authenticated;


-- ===== 20261105000000_jarvis_phase3.sql =====
-- JARVIS AI — Fase 3: integração com o iOS (Siri/Atalhos/App Intents e ações executadas no iPhone).

-- ---------------------------------------------------------------------------
-- Tokens de aparelho para os Atalhos/Siri em segundo plano.
-- Escopo restrito (resumo, agenda, registrar tarefa, salvar memória), revogáveis.
-- Só o HASH (SHA-256) é armazenado; o token em claro fica no Keychain do iPhone.
-- ---------------------------------------------------------------------------
create table if not exists public.jarvis_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  name text not null default 'iPhone' check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists jarvis_device_tokens_user_idx on public.jarvis_device_tokens (user_id, created_at desc);

alter table public.jarvis_device_tokens enable row level security;

-- O usuário vê os próprios aparelhos (sem o hash) e pode revogá-los; a criação é do backend.
create policy "jarvis_device_tokens_select_own" on public.jarvis_device_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy "jarvis_device_tokens_update_own" on public.jarvis_device_tokens
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.jarvis_device_tokens from anon, authenticated;
grant select (id, user_id, name, created_at, last_used_at, revoked_at) on public.jarvis_device_tokens to authenticated;
grant update (revoked_at) on public.jarvis_device_tokens to authenticated;

-- ---------------------------------------------------------------------------
-- Ações pendentes executadas no PRÓPRIO iPhone (lembretes/eventos nativos, ligações,
-- mensagens). O backend só marca como concluída quando o aparelho reporta sucesso.
-- ---------------------------------------------------------------------------
alter table public.jarvis_pending_actions
  add column if not exists executor text not null default 'server' check (executor in ('server', 'device'));


-- ===== 20261106000000_jarvis_phase4.sql =====
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


-- ===== 20261107000000_jarvis_phase5.sql =====
-- JARVIS AI — Fase 5: memória semântica, resumo de conversas, rotinas e controle de custos.

-- ---------------------------------------------------------------------------
-- Controle de custos: limite mensal, modo econômico e alerta de 80%
-- ---------------------------------------------------------------------------
alter table public.jarvis_profiles
  add column if not exists monthly_cost_limit_usd numeric(10, 2) not null default 20 check (monthly_cost_limit_usd >= 0),
  add column if not exists economy_mode boolean not null default false,
  add column if not exists budget_alert_key text;

alter table public.jarvis_usage drop constraint if exists jarvis_usage_kind_check;
alter table public.jarvis_usage add constraint jarvis_usage_kind_check check (kind in ('chat', 'tts', 'embedding', 'summary'));

-- ---------------------------------------------------------------------------
-- Memória semântica (opcional): vetor calculado pelo backend; busca por cosseno no servidor.
-- ---------------------------------------------------------------------------
alter table public.jarvis_memories
  add column if not exists embedding real[],
  add column if not exists embedding_model text;

-- ---------------------------------------------------------------------------
-- Resumo automático de conversas longas (memória contextual)
-- ---------------------------------------------------------------------------
alter table public.jarvis_conversations
  add column if not exists summary text,
  add column if not exists summary_upto integer not null default 0;

-- ---------------------------------------------------------------------------
-- Rotinas personalizadas: frase de ativação + instruções + agenda opcional
-- ---------------------------------------------------------------------------
create table if not exists public.jarvis_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  trigger_phrase text not null check (char_length(trigger_phrase) between 3 and 80),
  instructions text not null check (char_length(instructions) between 5 and 2000),
  weekday smallint check (weekday between 0 and 6),
  run_time text check (run_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  schedule_enabled boolean not null default false,
  enabled boolean not null default true,
  last_run_key text,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jarvis_routines_user_idx on public.jarvis_routines (user_id);

drop trigger if exists jarvis_routines_touch on public.jarvis_routines;
create trigger jarvis_routines_touch before update on public.jarvis_routines
  for each row execute function public.jarvis_touch_updated_at();

alter table public.jarvis_routines enable row level security;
create policy "jarvis_routines_all_own" on public.jarvis_routines
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.jarvis_routines from anon;
grant select, insert, update, delete on public.jarvis_routines to authenticated;


commit;
