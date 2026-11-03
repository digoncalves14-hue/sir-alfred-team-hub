/**
 * Acesso às APIs do Google em nome de um usuário: busca o refresh token cifrado,
 * renova o access token (com cache em memória) e faz as requisições.
 */
import type { GoogleService } from "@jarvis/shared";
import type { SecretBox } from "../security/crypto";
import type { IntegrationSecret, SystemStore } from "../store/types";
import { IntegrationError, SERVICE_LABEL } from "./errors";
import type { GoogleOAuth } from "./oauth";
import { CalendarApi } from "./calendar";
import { GmailApi } from "./gmail";
import { SheetsApi } from "./sheets";

export type GoogleFetch = (url: string, init?: RequestInit) => Promise<unknown>;

export class GoogleGateway {
  private readonly cache = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    private readonly deps: { oauth: GoogleOAuth; system: SystemStore; box: SecretBox; fetchImpl?: typeof fetch },
  ) {}

  get oauth() {
    return this.deps.oauth;
  }

  forUser(userId: string): GoogleUser {
    return new GoogleUser(userId, this);
  }

  async integration(userId: string): Promise<IntegrationSecret | null> {
    return this.deps.system.getIntegrationSecret(userId, "google");
  }

  async accessToken(userId: string, force = false): Promise<string> {
    const cached = this.cache.get(userId);
    if (!force && cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
    const integ = await this.integration(userId);
    if (!integ || integ.status === "revoked") throw new IntegrationError("nao_conectado", "A conta Google não está conectada. Conecte em Ajustes › Integrações.");
    try {
      const { accessToken, expiresAt } = await this.deps.oauth.refresh(this.deps.box.decrypt(integ.encryptedRefreshToken));
      this.cache.set(userId, { token: accessToken, expiresAt });
      if (integ.status === "error") await this.deps.system.setIntegrationStatus(userId, "google", "active", null);
      return accessToken;
    } catch (e) {
      if (e instanceof IntegrationError && e.code === "reconectar") {
        await this.deps.system.setIntegrationStatus(userId, "google", "error", e.message);
      }
      throw e;
    }
  }

  /** Requisição JSON autenticada; repete uma vez com token novo se receber 401. */
  async request(userId: string, url: string, init: RequestInit = {}): Promise<unknown> {
    const doFetch = this.deps.fetchImpl ?? fetch;
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.accessToken(userId, attempt > 0);
      const res = await doFetch(url, {
        ...init,
        headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
      });
      if (res.status === 401 && attempt === 0) continue;
      if (res.status === 204) return null;
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        const msg = body?.error?.message ?? `HTTP ${res.status}`;
        if (res.status === 403) throw new IntegrationError("servico_nao_autorizado", `O Google negou o acesso: ${msg}`, 403);
        throw new IntegrationError("erro_google", `Erro da API do Google: ${msg}`, res.status);
      }
      return body;
    }
    throw new IntegrationError("reconectar", "Não foi possível autenticar no Google. Reconecte a conta.");
  }

  forget(userId: string) {
    this.cache.delete(userId);
  }
}

export class GoogleUser {
  private integ: Promise<IntegrationSecret | null> | null = null;

  constructor(
    readonly userId: string,
    private readonly gw: GoogleGateway,
  ) {}

  private async require(service: GoogleService) {
    this.integ ??= this.gw.integration(this.userId);
    const integ = await this.integ;
    if (!integ || integ.status === "revoked") {
      throw new IntegrationError("nao_conectado", `${SERVICE_LABEL[service]} não está conectado. Conecte a conta Google em Ajustes › Integrações.`);
    }
    if (integ.status === "error") throw new IntegrationError("reconectar", integ.lastError ?? "Reconecte a conta Google em Ajustes › Integrações.");
    if (!integ.services.includes(service)) {
      throw new IntegrationError("servico_nao_autorizado", `A permissão do ${SERVICE_LABEL[service]} não foi concedida. Reconecte marcando ${SERVICE_LABEL[service]}.`);
    }
  }

  async connected(service: GoogleService): Promise<boolean> {
    try {
      await this.require(service);
      return true;
    } catch {
      return false;
    }
  }

  async calendar(): Promise<CalendarApi> {
    await this.require("calendar");
    return new CalendarApi((url, init) => this.gw.request(this.userId, url, init));
  }

  async sheets(): Promise<SheetsApi> {
    await this.require("sheets");
    return new SheetsApi((url, init) => this.gw.request(this.userId, url, init));
  }

  async gmail(): Promise<GmailApi> {
    await this.require("gmail");
    return new GmailApi((url, init) => this.gw.request(this.userId, url, init));
  }
}
