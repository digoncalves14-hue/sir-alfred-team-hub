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
