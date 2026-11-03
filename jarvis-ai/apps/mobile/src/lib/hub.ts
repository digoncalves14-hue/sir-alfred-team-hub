/**
 * Conexão com o Sir Alfred Team Hub (app da equipe) por OAuth 2.1 + PKCE.
 * O dono faz login e autoriza na tela de consentimento do próprio Hub; o app só
 * repassa o código ao backend, que guarda a credencial cifrada.
 */
import * as WebBrowser from "expo-web-browser";
import { api } from "./api";

export async function connectHub(): Promise<{ ok: true; account: string | null } | { ok: false; cancelled: boolean; message: string }> {
  const { authUrl, redirectUri } = await api.hubStart();
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
  if (result.type !== "success") return { ok: false, cancelled: true, message: "Conexão cancelada." };
  const url = new URL(result.url);
  const error = url.searchParams.get("error");
  if (error) return { ok: false, cancelled: error === "access_denied", message: url.searchParams.get("error_description") ?? `O Hub retornou: ${error}` };
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return { ok: false, cancelled: false, message: "Resposta do Hub incompleta." };
  const done = await api.hubComplete(code, state);
  return { ok: true, account: done.accountLabel };
}
