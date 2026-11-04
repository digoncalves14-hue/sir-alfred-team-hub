/**
 * Entrada do Jarvis como função da Vercel. O mesmo servidor Fastify do index.ts,
 * sem o agendador contínuo (funções não ficam ligadas): lembretes e resumos rodam
 * quando um cron chama POST /internal/cron/tick.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig } from "./config";
import { createJarvis } from "./create";

let ready: Promise<Awaited<ReturnType<typeof createJarvis>>["app"]> | null = null;

function getApp() {
  ready ??= (async () => {
    const { app } = await createJarvis(loadConfig(), { startScheduler: false });
    await app.ready();
    return app;
  })().catch((e) => {
    ready = null; // tenta de novo na próxima requisição
    throw e;
  });
  return ready;
}

/** As rotas da Vercel levam o caminho original em ?__jarvis_path=… (ver scripts/build-vercel.ts). */
export function restoreUrl(url: string): string {
  const u = new URL(url, "http://local");
  const path = u.searchParams.get("__jarvis_path");
  if (!path || !path.startsWith("/")) return url;
  u.searchParams.delete("__jarvis_path");
  const qs = u.searchParams.toString();
  return path + (qs ? `?${qs}` : "");
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  req.url = restoreUrl(req.url ?? "/");
  try {
    const app = await getApp();
    app.server.emit("request", req, res);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: { code: "configuracao", message: e instanceof Error ? e.message : "Falha ao iniciar o servidor." } }));
  }
}
