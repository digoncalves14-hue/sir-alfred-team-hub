/**
 * Conversa em streaming (Fase 5): usa o fetch do Expo (suporta corpo em fluxo) para
 * receber o texto do Jarvis conforme é gerado — o app começa a falar na 1ª frase.
 */
import { fetch as expoFetch } from "expo/fetch";
import { StreamEventSchema, type ChatRequest, type ChatResponse, type ToolEvent } from "@jarvis/shared";
import { ApiError } from "./api";
import { config } from "./config";
import { supabase } from "./supabase";
import { createSseParser } from "@/logic/sse";

export interface StreamHandlers {
  onDelta?: (text: string) => void;
  onTool?: (event: ToolEvent) => void;
}

export async function chatStream(req: ChatRequest, handlers: StreamHandlers, signal?: AbortSignal): Promise<ChatResponse> {
  if (!config.apiUrl) throw new ApiError(0, "sem_servidor", "EXPO_PUBLIC_API_URL não configurado.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, "nao_autenticado", "Sessão expirada. Entre novamente.");

  let res: Response;
  try {
    res = (await expoFetch(`${config.apiUrl}/v1/chat/stream`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(req),
      signal,
    })) as unknown as Response;
  } catch {
    throw new ApiError(0, "sem_conexao", "Não foi possível conectar ao servidor do Jarvis.");
  }
  if (!res.ok || !res.body) {
    let message = `Erro ${res.status}`;
    try {
      message = ((await res.json()) as { error?: { message?: string } }).error?.message ?? message;
    } catch {
      /* corpo não-JSON */
    }
    throw new ApiError(res.status, "erro", message);
  }

  let final: ChatResponse | null = null;
  let failure: ApiError | null = null;
  const parser = createSseParser((_event, raw) => {
    const parsed = StreamEventSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return;
    const ev = parsed.data;
    if (ev.type === "delta") handlers.onDelta?.(ev.text);
    else if (ev.type === "tool") handlers.onTool?.(ev.event);
    else if (ev.type === "done") final = ev.response;
    else failure = new ApiError(ev.status, ev.code, ev.message);
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
  }
  parser.feed(decoder.decode());
  if (failure) throw failure;
  if (!final) throw new ApiError(0, "resposta_incompleta", "A resposta do Jarvis foi interrompida. Tente novamente.");
  return final;
}
