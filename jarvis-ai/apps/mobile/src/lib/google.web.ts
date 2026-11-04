/**
 * Versão web: o login do Google acontece na mesma janela. O Google devolve o
 * navegador para /google-oauth (página do Jarvis), que conclui a conexão pelo backend.
 * O token fica cifrado no servidor; o navegador nunca o vê.
 */
import type { GoogleService } from "@jarvis/shared";
import { api } from "./api";

export type ConnectResult = { ok: true; email: string | null; services: string[] } | { ok: false; cancelled: boolean; message: string };

export async function connectGoogle(services: GoogleService[]): Promise<ConnectResult> {
  const { authUrl, redirectUri } = await api.googleStart(services);
  if (!redirectUri.startsWith(window.location.origin)) {
    return {
      ok: false,
      cancelled: false,
      message: "O servidor está configurado para o app do iPhone. Para a versão web, configure GOOGLE_WEB_CLIENT_ID e GOOGLE_WEB_CLIENT_SECRET (veja docs/WEB.md).",
    };
  }
  window.location.assign(authUrl);
  return { ok: false, cancelled: true, message: "" };
}
