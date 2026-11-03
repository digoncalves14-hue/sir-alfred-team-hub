/**
 * Autenticação: o app envia o access token (JWT) da sessão Supabase.
 * O backend valida o token no Supabase Auth e cria um cliente com esse mesmo
 * token — assim o RLS do banco garante que cada usuário só acessa seus dados.
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { AppError } from "./errors";
import { createUserClient, SupabaseUserStore } from "./store/supabase-store";
import type { UserStore } from "./store/types";

export type Authenticator = (accessToken: string) => Promise<UserStore>;

export function createSupabaseAuthenticator(url: string, anonKey: string): Authenticator {
  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // Cache curto de tokens já validados (reduz latência por requisição).
  const cache = new Map<string, { userId: string; until: number }>();

  return async (accessToken: string) => {
    const key = createHash("sha256").update(accessToken).digest("hex");
    const now = Date.now();
    let entry = cache.get(key);
    if (!entry || entry.until < now) {
      const { data, error } = await authClient.auth.getUser(accessToken);
      if (error || !data.user) throw new AppError("nao_autenticado", 401, "Sessão inválida ou expirada. Entre novamente.");
      entry = { userId: data.user.id, until: now + 60_000 };
      cache.set(key, entry);
      if (cache.size > 1000) for (const [k, v] of cache) if (v.until < now) cache.delete(k);
    }
    return new SupabaseUserStore(entry.userId, createUserClient(url, anonKey, accessToken));
  };
}
