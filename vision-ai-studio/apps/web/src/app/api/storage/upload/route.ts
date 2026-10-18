import type { NextRequest } from "next/server";
import { and, eq, getDb, assets } from "@vision/db";
import { LocalStorage, getStorage, verifyLocalUrl } from "@vision/server";
import { HttpError, json, publicApi } from "@/lib/api";

export const runtime = "nodejs";

/** Recebe o upload (driver local) em streaming, validando a URL assinada e o tamanho. */
export const PUT = publicApi(async (req: NextRequest) => {
  const storage = getStorage();
  if (!(storage instanceof LocalStorage)) throw new HttpError(404, "Rota disponível apenas com armazenamento local.");
  const key = verifyLocalUrl("put", req.nextUrl.searchParams, ["max"]);
  if (!key) throw new HttpError(403, "Link de upload inválido ou expirado.");
  const max = Number(req.nextUrl.searchParams.get("max"));
  const [asset] = await getDb().select().from(assets).where(and(eq(assets.storageKey, key), eq(assets.status, "pending_upload")));
  if (!asset) throw new HttpError(404, "Upload não encontrado ou já concluído.");
  if (!req.body) throw new HttpError(400, "Arquivo vazio.");
  try {
    const size = await storage.writeStream(key, req.body as unknown as AsyncIterable<Uint8Array>, max);
    return json({ ok: true, size });
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
