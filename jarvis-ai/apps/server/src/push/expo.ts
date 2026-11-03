/**
 * Envio de notificações push pelo serviço gratuito da Expo (que entrega via APNs).
 * https://exp.host/--/api/v2/push/send — tokens inválidos são removidos.
 */
import type { SystemStore } from "../store/types";

export interface PushMessage {
  title: string;
  body: string;
  /** Abre o app nesta rota ao tocar (ex.: "jarvis://dashboard"). */
  url?: string;
}

export interface PushSender {
  send(userId: string, msg: PushMessage): Promise<{ sent: number; failed: number }>;
}

export class ExpoPushSender implements PushSender {
  constructor(
    private readonly system: SystemStore,
    private readonly opts: { accessToken?: string; fetchImpl?: typeof fetch; log?: { warn: (o: object, m?: string) => void } } = {},
  ) {}

  async send(userId: string, msg: PushMessage) {
    const tokens = await this.system.listPushTokens(userId);
    if (tokens.length === 0) return { sent: 0, failed: 0 };
    const payload = tokens.map((to) => ({
      to,
      title: msg.title,
      body: msg.body.length > 230 ? `${msg.body.slice(0, 227)}…` : msg.body,
      sound: "default",
      data: { url: msg.url ?? "jarvis://" },
    }));
    const res = await (this.opts.fetchImpl ?? fetch)("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(this.opts.accessToken ? { authorization: `Bearer ${this.opts.accessToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      this.opts.log?.warn({ status: res.status }, "falha no envio de push");
      return { sent: 0, failed: tokens.length };
    }
    const body = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    let sent = 0;
    let failed = 0;
    for (const [i, ticket] of (body.data ?? []).entries()) {
      if (ticket.status === "ok") sent++;
      else {
        failed++;
        if (ticket.details?.error === "DeviceNotRegistered") await this.system.deletePushToken(tokens[i]!);
      }
    }
    return { sent, failed };
  }
}
