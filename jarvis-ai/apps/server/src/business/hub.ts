/**
 * Conector "Sir Alfred Team Hub": o app da equipe (Supabase) atua como servidor
 * OAuth 2.1. O Jarvis é um cliente PÚBLICO (PKCE, sem segredo). O dono autoriza
 * na tela de consentimento do Hub; o acesso respeita o RLS do Hub. Somente leitura.
 * Docs: https://supabase.com/docs/guides/auth/oauth-server/oauth-flows
 */
import { randomBytes } from "node:crypto";
import { pkcePair, type SecretBox } from "../security/crypto";
import { IntegrationError } from "../google/errors";

export const HUB_REDIRECT_URI = "jarvis://hub-oauth";
const STATE_TTL_MS = 10 * 60_000;

export interface HubConfig {
  url: string;
  publishableKey: string;
  clientId: string;
}

export interface HubTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class HubOAuth {
  constructor(
    readonly cfg: HubConfig,
    private readonly box: SecretBox,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private get base() {
    return this.cfg.url.replace(/\/+$/, "");
  }

  start(userId: string, now = Date.now()): { authUrl: string; redirectUri: string } {
    const { verifier, challenge } = pkcePair();
    const state = this.box.encrypt(JSON.stringify({ u: userId, v: verifier, e: now + STATE_TTL_MS, k: "hub", n: randomBytes(8).toString("hex") }));
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.cfg.clientId,
      redirect_uri: HUB_REDIRECT_URI,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "email",
    });
    return { authUrl: `${this.base}/auth/v1/oauth/authorize?${params}`, redirectUri: HUB_REDIRECT_URI };
  }

  private async token(body: Record<string, string>): Promise<HubTokens> {
    const res = await this.fetchImpl(`${this.base}/auth/v1/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ client_id: this.cfg.clientId, ...body }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof json.access_token !== "string" || typeof json.refresh_token !== "string") {
      const code = String(json.error ?? json.error_code ?? res.status);
      if (body.grant_type === "refresh_token") {
        throw new IntegrationError("reconectar", "O acesso ao Sir Alfred Team Hub expirou ou foi revogado. Reconecte na aba Negócios.");
      }
      throw new IntegrationError("erro_conector", `O Sir Alfred Team Hub recusou a conexão (${code}).`, 400);
    }
    return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000 };
  }

  async complete(userId: string, code: string, state: string, now = Date.now()): Promise<HubTokens & { email: string | null }> {
    let p: { u: string; v: string; e: number; k: string };
    try {
      p = JSON.parse(this.box.decrypt(state));
    } catch {
      throw new IntegrationError("erro_conector", "Pedido de conexão inválido. Tente novamente.", 400);
    }
    if (p.k !== "hub" || p.u !== userId) throw new IntegrationError("erro_conector", "Este pedido de conexão pertence a outra sessão.", 400);
    if (p.e < now) throw new IntegrationError("erro_conector", "O pedido de conexão expirou. Tente novamente.", 400);
    const tokens = await this.token({ grant_type: "authorization_code", code, redirect_uri: HUB_REDIRECT_URI, code_verifier: p.v });
    return { ...tokens, email: await this.email(tokens.accessToken) };
  }

  /** Atenção: o Supabase pode ROTACIONAR o refresh token — o chamador deve salvar o novo. */
  refresh(refreshToken: string): Promise<HubTokens> {
    return this.token({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  private async email(accessToken: string): Promise<string | null> {
    try {
      const res = await this.fetchImpl(`${this.base}/auth/v1/oauth/userinfo`, { headers: { authorization: `Bearer ${accessToken}` } });
      if (!res.ok) return null;
      return ((await res.json()) as { email?: string }).email ?? null;
    } catch {
      return null;
    }
  }

  /** Leitura via PostgREST do Hub com o token do dono (RLS do Hub aplicado). */
  async select<T>(accessToken: string, table: string, query: string): Promise<T[]> {
    const res = await this.fetchImpl(`${this.base}/rest/v1/${table}?${query}`, {
      headers: { apikey: this.cfg.publishableKey, authorization: `Bearer ${accessToken}`, accept: "application/json" },
    });
    if (res.status === 401) throw new IntegrationError("reconectar", "Sessão do Sir Alfred Team Hub expirada.");
    if (!res.ok) throw new IntegrationError("erro_conector", `O Sir Alfred Team Hub respondeu ${res.status} ao ler ${table}.`, res.status);
    return (await res.json()) as T[];
  }
}
