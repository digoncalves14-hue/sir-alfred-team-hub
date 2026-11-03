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
