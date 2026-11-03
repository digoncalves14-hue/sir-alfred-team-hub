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
