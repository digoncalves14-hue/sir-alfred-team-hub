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
