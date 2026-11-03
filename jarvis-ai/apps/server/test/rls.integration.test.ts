/**
 * Teste de integração: aplica a migração REAL em um PostgreSQL e verifica
 * as políticas de Row Level Security, simulando o ambiente do Supabase
 * (papéis anon/authenticated, schema auth e auth.uid() a partir do JWT).
 *
 * Executar: npm run db:test:up && npm run test:integration
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.JARVIS_TEST_DB === "1";
const ADMIN_URL = process.env.JARVIS_TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/postgres";
const DB_NAME = `jarvis_rls_${Date.now()}`;
const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "../../../supabase/migrations");

const SUPABASE_STUB = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  -- Como no Supabase: a service_role recebe acesso total às tabelas novas.
  alter default privileges in schema public grant all on tables to service_role;
  grant usage on schema public to service_role;
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

let admin: pg.Client;
let db: pg.Pool;
const A = randomUUID();
const B = randomUUID();

/** Executa `fn` como um usuário autenticado (equivalente ao JWT no Supabase). */
async function asService<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query("set local role service_role");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

async function as<T>(userId: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${userId ? "authenticated" : "anon"}`);
    if (userId) await c.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

describe.skipIf(!enabled)("RLS no PostgreSQL (migração real)", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`create database ${DB_NAME}`);
    const url = new URL(ADMIN_URL);
    url.pathname = `/${DB_NAME}`;
    db = new pg.Pool({ connectionString: url.toString() });
    await db.query(SUPABASE_STUB);
    for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
      await db.query(readFileSync(join(migrationsDir, file), "utf8"));
    }
    await db.query("insert into auth.users (id) values ($1), ($2)", [A, B]);
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`drop database if exists ${DB_NAME}`);
    await admin?.end();
  });

  it("cada usuário só enxerga os próprios dados", async () => {
    const convId = await as(A, async (c) => {
      await c.query("insert into public.jarvis_profiles (user_id, owner_name) values ($1, 'Sr. A')", [A]);
      const conv = await c.query("insert into public.jarvis_conversations (title) values ('Plano') returning id");
      await c.query("insert into public.jarvis_messages (conversation_id, role, content) values ($1, 'user', 'oi')", [conv.rows[0].id]);
      await c.query("insert into public.jarvis_memories (category, space, content) values ('decisao', 'black_bear', 'Lançar pomada em março')");
      return conv.rows[0].id as string;
    });

    await as(B, async (c) => {
      for (const t of ["jarvis_profiles", "jarvis_conversations", "jarvis_messages", "jarvis_memories"]) {
        const r = await c.query(`select count(*)::int as n from public.${t}`);
        expect(r.rows[0].n, t).toBe(0);
      }
      // B não consegue alterar nem apagar dados de A (0 linhas afetadas)
      expect((await c.query("update public.jarvis_memories set content = 'hack'")).rowCount).toBe(0);
      expect((await c.query("delete from public.jarvis_conversations where id = $1", [convId])).rowCount).toBe(0);
    });

    await as(A, async (c) => {
      expect((await c.query("select count(*)::int as n from public.jarvis_memories")).rows[0].n).toBe(1);
    });
  });

  it("impede inserir linhas em nome de outro usuário ou em conversa alheia", async () => {
    const convId = await as(A, async (c) => (await c.query("insert into public.jarvis_conversations (title) values ('x') returning id")).rows[0].id);
    await expect(
      as(B, (c) => c.query("insert into public.jarvis_memories (user_id, category, content) values ($1, 'outro', 'injetado')", [A])),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(B, (c) => c.query("insert into public.jarvis_messages (conversation_id, role, content) values ($1, 'user', 'intruso')", [convId])),
    ).rejects.toThrow(/row-level security/);
  });

  it("registro de ações é imutável para o usuário", async () => {
    await as(A, (c) => c.query("insert into public.jarvis_action_log (tool_name, status, summary) values ('t', 'executed', 's')"));
    await expect(as(A, (c) => c.query("update public.jarvis_action_log set summary = 'alterado'"))).rejects.toThrow(/permission denied/);
    await expect(as(A, (c) => c.query("delete from public.jarvis_action_log"))).rejects.toThrow(/permission denied/);
  });

  it("papel anônimo não acessa nenhuma tabela", async () => {
    await expect(as(null, (c) => c.query("select * from public.jarvis_memories"))).rejects.toThrow(/permission denied/);
  });

  it("valida categorias/espaços e atualiza updated_at", async () => {
    await expect(
      as(A, (c) => c.query("insert into public.jarvis_memories (category, content) values ('invalida', 'abc')")),
    ).rejects.toThrow(/check constraint/);
    const id = await as(A, async (c) =>
      (await c.query("insert into public.jarvis_memories (category, content) values ('preferencia', 'Café sem açúcar') returning id")).rows[0].id,
    );
    await new Promise((r) => setTimeout(r, 20));
    const [before, after] = await as(A, async (c) => {
      const b = (await c.query("select updated_at from public.jarvis_memories where id = $1", [id])).rows[0].updated_at as Date;
      await c.query("commit; begin");
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [A]);
      await c.query("update public.jarvis_memories set content = 'Café com pouco açúcar' where id = $1", [id]);
      const a = (await c.query("select updated_at, search::text from public.jarvis_memories where id = $1", [id])).rows[0];
      return [b, a] as const;
    });
    expect(after.updated_at.getTime()).toBeGreaterThan(before.getTime());
    expect(after.search).toContain("açúc");
  });

  it("ações pendentes não podem ser apagadas pelo usuário", async () => {
    await as(A, (c) => c.query("insert into public.jarvis_pending_actions (tool_name, input, summary) values ('apagar_memoria', '{}', 'Apagar x')"));
    await expect(as(A, (c) => c.query("delete from public.jarvis_pending_actions"))).rejects.toThrow(/permission denied/);
  });

  it("a migração é idempotente nas estruturas (create if not exists / or replace)", async () => {
    const sql = readFileSync(join(migrationsDir, readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()[0]!), "utf8");
    // Políticas não são idempotentes por design (create policy); removemos para reaplicar o restante.
    const withoutPolicies = sql.replace(/create policy[\s\S]*?;\n/g, "");
    await expect(db.query(withoutPolicies)).resolves.toBeDefined();
  });

  // ------------------------------- Fase 2 -------------------------------
  it("integrações: usuário vê só o status, NUNCA o token cifrado, e não escreve", async () => {
    await as(A, (c) => c.query("insert into public.jarvis_profiles (user_id) values ($1) on conflict do nothing", [A]));
    await asService((c) =>
      c.query(
        "insert into public.jarvis_integrations (user_id, provider, account_email, services, encrypted_refresh_token) values ($1, 'google', 'a@x.com', '{calendar}', 'v1.cifrado')",
        [A],
      ),
    );
    const own = await as(A, (c) => c.query("select provider, account_email, services, status from public.jarvis_integrations"));
    expect(own.rows).toEqual([{ provider: "google", account_email: "a@x.com", services: ["calendar"], status: "active" }]);
    await expect(as(A, (c) => c.query("select encrypted_refresh_token from public.jarvis_integrations"))).rejects.toThrow(/permission denied/);
    await expect(as(A, (c) => c.query("select * from public.jarvis_integrations"))).rejects.toThrow(/permission denied/);
    await expect(
      as(A, (c) => c.query("insert into public.jarvis_integrations (user_id, provider, encrypted_refresh_token) values ($1, 'google', 'x')", [A])),
    ).rejects.toThrow(/permission denied/);
    expect((await as(B, (c) => c.query("select provider from public.jarvis_integrations"))).rows).toHaveLength(0);
  });

  it("tarefas: CRUD próprio e isolado", async () => {
    const id = await as(A, async (c) =>
      (await c.query("insert into public.jarvis_tasks (title, space, priority, due_date, remind_at) values ('Pagar fornecedor', 'black_bear', 'alta', '2026-11-05', now()) returning id")).rows[0].id,
    );
    expect((await as(B, (c) => c.query("select id from public.jarvis_tasks"))).rows).toHaveLength(0);
    expect((await as(B, (c) => c.query("update public.jarvis_tasks set status = 'concluida' where id = $1", [id]))).rowCount).toBe(0);
    expect((await as(A, (c) => c.query("update public.jarvis_tasks set status = 'concluida' where id = $1", [id]))).rowCount).toBe(1);
    await expect(as(A, (c) => c.query("insert into public.jarvis_tasks (title, priority) values ('x', 'urgentissima')"))).rejects.toThrow(/check constraint/);
  });

  it("notificações: criadas só pelo backend; usuário apenas lê e marca como lida", async () => {
    const id = await asService(async (c) =>
      (await c.query("insert into public.jarvis_notifications (user_id, kind, title, body, dedupe_key) values ($1, 'sistema', 't', 'b', 'k1') returning id", [A])).rows[0].id,
    );
    await expect(
      asService((c) => c.query("insert into public.jarvis_notifications (user_id, kind, title, body, dedupe_key) values ($1, 'sistema', 't', 'b', 'k1')", [A])),
    ).rejects.toThrow(/duplicate key/);
    expect((await as(A, (c) => c.query("update public.jarvis_notifications set read_at = now() where id = $1", [id]))).rowCount).toBe(1);
    await expect(as(A, (c) => c.query("update public.jarvis_notifications set body = 'alterado' where id = $1", [id]))).rejects.toThrow(/permission denied/);
    await expect(
      as(A, (c) => c.query("insert into public.jarvis_notifications (user_id, kind, title, body, dedupe_key) values ($1, 'sistema', 'x', 'y', 'k2')", [A])),
    ).rejects.toThrow(/permission denied/);
    expect((await as(B, (c) => c.query("select id from public.jarvis_notifications"))).rows).toHaveLength(0);
  });

  it("push tokens isolados e preferências de resumo validadas", async () => {
    await as(A, (c) => c.query("insert into public.jarvis_push_tokens (token) values ('ExponentPushToken[a]')"));
    expect((await as(B, (c) => c.query("select token from public.jarvis_push_tokens"))).rows).toHaveLength(0);
    await expect(as(A, (c) => c.query("update public.jarvis_profiles set daily_summary_time = '25:00' where user_id = $1", [A]))).rejects.toThrow(/check constraint/);
    expect((await as(A, (c) => c.query("update public.jarvis_profiles set daily_summary_time = '07:30' where user_id = $1", [A]))).rowCount).toBe(1);
  });

  it("reivindicação atômica de lembrete: só uma execução ganha", async () => {
    const id = await as(A, async (c) => (await c.query("insert into public.jarvis_tasks (title, remind_at) values ('lembrar', now() - interval '1 minute') returning id")).rows[0].id);
    const claim = () => asService((c) => c.query("update public.jarvis_tasks set reminded_at = now() where id = $1 and reminded_at is null returning id", [id]));
    const [r1, r2] = await Promise.all([claim(), claim()]);
    expect((r1.rowCount ?? 0) + (r2.rowCount ?? 0)).toBe(1);
  });

  // ------------------------------- Fase 3 -------------------------------
  it("tokens de aparelho: usuário vê e revoga os próprios, nunca o hash; criação só pelo backend", async () => {
    const id = await asService(async (c) =>
      (await c.query("insert into public.jarvis_device_tokens (user_id, token_hash, name) values ($1, 'hash-secreto', 'iPhone') returning id", [A])).rows[0].id,
    );
    expect((await as(A, (c) => c.query("select id, name, revoked_at from public.jarvis_device_tokens"))).rows).toHaveLength(1);
    await expect(as(A, (c) => c.query("select token_hash from public.jarvis_device_tokens"))).rejects.toThrow(/permission denied/);
    await expect(as(A, (c) => c.query("insert into public.jarvis_device_tokens (user_id, token_hash) values ($1, 'x')", [A]))).rejects.toThrow(/permission denied/);
    expect((await as(B, (c) => c.query("select id from public.jarvis_device_tokens"))).rows).toHaveLength(0);
    expect((await as(B, (c) => c.query("update public.jarvis_device_tokens set revoked_at = now() where id = $1", [id]))).rowCount).toBe(0);
    expect((await as(A, (c) => c.query("update public.jarvis_device_tokens set revoked_at = now() where id = $1", [id]))).rowCount).toBe(1);
    await expect(as(A, (c) => c.query("update public.jarvis_device_tokens set token_hash = 'outro' where id = $1", [id]))).rejects.toThrow(/permission denied/);
  });

  it("ações pendentes aceitam executor do aparelho e rejeitam valores inválidos", async () => {
    await as(A, (c) => c.query("insert into public.jarvis_pending_actions (tool_name, input, summary, executor) values ('iphone_criar_lembrete', '{}', 's', 'device')"));
    await expect(
      as(A, (c) => c.query("insert into public.jarvis_pending_actions (tool_name, input, summary, executor) values ('x', '{}', 's', 'nuvem')")),
    ).rejects.toThrow(/check constraint/);
  });

  // ------------------------------- Fase 4 -------------------------------
  it("conectores: usuário vê config e status, nunca o segredo; não cria nem altera", async () => {
    await asService((c) =>
      c.query("insert into public.jarvis_connectors (user_id, space, type, name, encrypted_secret) values ($1, 'sir_alfred', 'sir_alfred_hub', 'Hub', 'v1.cifrado')", [A]),
    );
    expect((await as(A, (c) => c.query("select name, type, status from public.jarvis_connectors"))).rows).toEqual([{ name: "Hub", type: "sir_alfred_hub", status: "active" }]);
    await expect(as(A, (c) => c.query("select encrypted_secret from public.jarvis_connectors"))).rejects.toThrow(/permission denied/);
    await expect(as(A, (c) => c.query("update public.jarvis_connectors set name = 'x'"))).rejects.toThrow(/permission denied/);
    await expect(
      as(A, (c) => c.query("insert into public.jarvis_connectors (user_id, space, type, name) values ($1, 'pessoal', 'google_sheets', 'x')", [A])),
    ).rejects.toThrow(/permission denied/);
    expect((await as(B, (c) => c.query("select id from public.jarvis_connectors"))).rows).toHaveLength(0);
    expect((await as(B, (c) => c.query("delete from public.jarvis_connectors"))).rowCount).toBe(0);
    // Um único Hub por usuário
    await expect(
      asService((c) => c.query("insert into public.jarvis_connectors (user_id, space, type, name) values ($1, 'sir_alfred', 'sir_alfred_hub', 'Hub 2')", [A])),
    ).rejects.toThrow(/duplicate key/);
    expect((await as(A, (c) => c.query("delete from public.jarvis_connectors"))).rowCount).toBe(1);
  });

  it("automações são do usuário; relatórios só o backend cria", async () => {
    const id = await as(A, async (c) =>
      (await c.query("insert into public.jarvis_automations (kind, weekday, run_time) values ('pendencias', 1, '08:00') returning id")).rows[0].id,
    );
    expect((await as(B, (c) => c.query("update public.jarvis_automations set enabled = false where id = $1", [id]))).rowCount).toBe(0);
    await expect(as(A, (c) => c.query("insert into public.jarvis_automations (kind, run_time) values ('pendencias', '24:00')"))).rejects.toThrow(/check constraint/);
    await expect(as(A, (c) => c.query("insert into public.jarvis_automations (kind) values ('apagar_tudo')"))).rejects.toThrow(/check constraint/);
    await expect(
      as(A, (c) => c.query("insert into public.jarvis_reports (user_id, kind, title, body) values ($1, 'pendencias', 't', 'b')", [A])),
    ).rejects.toThrow(/permission denied/);
    await asService((c) => c.query("insert into public.jarvis_reports (user_id, kind, title, body) values ($1, 'pendencias', 't', 'b')", [A]));
    expect((await as(B, (c) => c.query("select id from public.jarvis_reports"))).rows).toHaveLength(0);
    expect((await as(A, (c) => c.query("select title from public.jarvis_reports"))).rows).toHaveLength(1);
  });
});
