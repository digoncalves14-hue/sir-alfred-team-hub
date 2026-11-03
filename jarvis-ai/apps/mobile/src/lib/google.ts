/**
 * Conexão com o Google (Agenda/Gmail) no modelo de app nativo:
 * o backend gera a URL (PKCE), o iOS abre uma sessão segura de login
 * (ASWebAuthenticationSession), o Google devolve o código ao app e o app
 * repassa ao backend, que troca pelo token e o guarda CIFRADO. O app nunca vê o token.
 */
import type { GoogleService } from "@jarvis/shared";
import * as WebBrowser from "expo-web-browser";
import { api } from "./api";

export type ConnectResult = { ok: true; email: string | null; services: string[] } | { ok: false; cancelled: boolean; message: string };

export async function connectGoogle(services: GoogleService[]): Promise<ConnectResult> {
  const { authUrl, redirectUri } = await api.googleStart(services);
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri, { preferEphemeralSession: false });
  if (result.type !== "success") return { ok: false, cancelled: true, message: "Conexão cancelada." };
  const url = new URL(result.url);
  const error = url.searchParams.get("error");
  if (error) return { ok: false, cancelled: error === "access_denied", message: error === "access_denied" ? "Você não autorizou o acesso." : `O Google retornou: ${error}` };
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return { ok: false, cancelled: false, message: "Resposta do Google incompleta. Tente novamente." };
  const done = await api.googleComplete(code, state);
  return { ok: true, email: done.accountEmail, services: done.services };
}
