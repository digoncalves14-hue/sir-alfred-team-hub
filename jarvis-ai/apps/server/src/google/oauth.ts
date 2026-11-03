/**
 * OAuth 2.0 do Google no modelo "app nativo" (RFC 8252): cliente OAuth do tipo iOS,
 * PKCE (S256), sem client secret. O app abre a URL, o Google devolve o código para
 * o esquema do app, e o app envia o código ao backend, que faz a troca e guarda o
 * refresh token criptografado. Funciona mesmo com o backend em rede local.
 */
import type { GoogleService } from "@jarvis/shared";
import { randomBytes } from "node:crypto";
import { pkcePair, type SecretBox } from "../security/crypto";
import { IntegrationError } from "./errors";

export const GOOGLE_SCOPES: Record<GoogleService, string[]> = {
  // Somente eventos (ler/criar/alterar) — não dá acesso às configurações das agendas.
  calendar: ["https://www.googleapis.com/auth/calendar.events"],
  // Ler e-mails + criar rascunhos/enviar. Nunca exclui e-mails.
  gmail: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"],
  // Somente LEITURA de planilhas (indicadores dos negócios). O Jarvis nunca altera planilhas.
  sheets: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
};
const BASE_SCOPES = ["openid", "email"];
const STATE_TTL_MS = 10 * 60_000;

export interface OAuthTokens {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  scopes: string[];
  email: string | null;
  services: GoogleService[];
}

export function servicesFromScopes(scopes: string[]): GoogleService[] {
  return (Object.keys(GOOGLE_SCOPES) as GoogleService[]).filter((s) => GOOGLE_SCOPES[s].every((sc) => scopes.includes(sc)));
}

/** "123-abc.apps.googleusercontent.com" → "com.googleusercontent.apps.123-abc" */
export function reversedClientId(clientId: string): string {
  const prefix = clientId.replace(/\.apps\.googleusercontent\.com$/, "");
  return `com.googleusercontent.apps.${prefix}`;
}

export class GoogleOAuth {
  readonly redirectUri: string;

  constructor(
    private readonly clientId: string,
    private readonly box: SecretBox,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.redirectUri = `${reversedClientId(clientId)}:/oauth2redirect`;
  }

  start(userId: string, services: GoogleService[], now = Date.now()): { authUrl: string; redirectUri: string } {
    const { verifier, challenge } = pkcePair();
    // O state é cifrado e autenticado (AES-GCM): carrega usuário, serviços, verificador PKCE e validade.
    const state = this.box.encrypt(JSON.stringify({ u: userId, s: services, v: verifier, e: now + STATE_TTL_MS, n: randomBytes(8).toString("hex") }));
    const scopes = [...BASE_SCOPES, ...services.flatMap((s) => GOOGLE_SCOPES[s])];
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    });
    return { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, redirectUri: this.redirectUri };
  }

  async complete(userId: string, code: string, state: string, now = Date.now()): Promise<OAuthTokens> {
    let payload: { u: string; s: GoogleService[]; v: string; e: number };
    try {
      payload = JSON.parse(this.box.decrypt(state));
    } catch {
      throw new IntegrationError("erro_google", "Pedido de conexão inválido. Tente conectar novamente.", 400);
    }
    if (payload.u !== userId) throw new IntegrationError("erro_google", "Este pedido de conexão pertence a outra sessão.", 400);
    if (payload.e < now) throw new IntegrationError("erro_google", "O pedido de conexão expirou. Tente novamente.", 400);

    const res = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        code,
        code_verifier: payload.v,
        redirect_uri: this.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new IntegrationError("erro_google", `O Google recusou a conexão (${String(body.error ?? res.status)}).`, 400);
    if (typeof body.refresh_token !== "string") {
      throw new IntegrationError(
        "erro_google",
        "O Google não enviou a autorização permanente. Remova o acesso do JARVIS em myaccount.google.com/permissions e conecte de novo.",
        400,
      );
    }
    const scopes = String(body.scope ?? "").split(/\s+/).filter(Boolean);
    const services = servicesFromScopes(scopes);
    if (services.length === 0) throw new IntegrationError("servico_nao_autorizado", "Nenhuma permissão foi concedida. Marque as caixas de permissão na tela do Google.", 400);
    const accessToken = String(body.access_token);
    return {
      refreshToken: body.refresh_token,
      accessToken,
      expiresAt: now + Number(body.expires_in ?? 3600) * 1000,
      scopes,
      services,
      email: await this.fetchEmail(accessToken),
    };
  }

  private async fetchEmail(accessToken: string): Promise<string | null> {
    try {
      const res = await this.fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${accessToken}` } });
      if (!res.ok) return null;
      const info = (await res.json()) as { email?: string };
      return info.email ?? null;
    } catch {
      return null;
    }
  }

  async refresh(refreshToken: string, now = Date.now()): Promise<{ accessToken: string; expiresAt: number }> {
    const res = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.clientId, refresh_token: refreshToken, grant_type: "refresh_token" }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      if (body.error === "invalid_grant") {
        throw new IntegrationError("reconectar", "O acesso ao Google expirou ou foi revogado. Reconecte em Ajustes › Integrações.");
      }
      throw new IntegrationError("erro_google", `Falha ao renovar o acesso ao Google (${String(body.error ?? res.status)}).`);
    }
    return { accessToken: String(body.access_token), expiresAt: now + Number(body.expires_in ?? 3600) * 1000 };
  }

  async revoke(token: string): Promise<void> {
    await this.fetchImpl(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
  }
}
