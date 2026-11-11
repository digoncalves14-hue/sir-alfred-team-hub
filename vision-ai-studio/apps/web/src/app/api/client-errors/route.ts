import { z } from "zod";
import { log } from "@vision/server";
import { api, json, readJson } from "@/lib/api";

const Body = z.object({
  message: z.string().max(2000),
  stack: z.string().max(8000).optional(),
  digest: z.string().max(200).optional(),
  url: z.string().max(500).optional(),
  userAgent: z.string().max(400).optional(),
});

/** Erros de tela do navegador (capturados pela barreira de erro) vão para o log do servidor para diagnóstico. */
export const POST = api(async (req, { session }) => {
  const b = await readJson(req, Body);
  log.error("client_error", { userId: session.user.id, url: b.url, message: b.message, digest: b.digest, stack: b.stack?.slice(0, 4000), userAgent: b.userAgent });
  return json({ ok: true });
});
