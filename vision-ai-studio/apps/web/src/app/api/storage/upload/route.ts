import type { NextRequest } from "next/server";
import { and, eq, getDb, assets } from "@vision/db";
import { getStorage, verifyLocalUrl } from "@vision/server";
import { HttpError, json, publicApi } from "@/lib/api";

export const runtime = "nodejs";

/** Recebe o upload em streaming (disco local ou S3 via aplicação), validando a URL assinada e o tamanho. */
export const PUT = publicApi(async (req: NextRequest) => {
  const storage = getStorage();
  const params = req.nextUrl.searchParams;
  const isPart = params.has("part");
  const key = verifyLocalUrl("put", params, isPart ? ["max", "part", "uploadId"] : ["max"]);
  if (!key) throw new HttpError(403, "Link de upload inválido ou expirado.");
  const max = Number(params.get("max"));
  const [asset] = await getDb().select().from(assets).where(and(eq(assets.storageKey, key), eq(assets.status, "pending_upload")));
  if (!asset) throw new HttpError(404, "Upload não encontrado ou já concluído.");
  if (!req.body) throw new HttpError(400, "Arquivo vazio.");
  const body = req.body as unknown as AsyncIterable<Uint8Array>;
  if (isPart) {
    const uploadId = params.get("uploadId")!;
    if ((asset.uploadSession as { uploadId?: string } | null)?.uploadId !== uploadId || !storage.writePart) {
      throw new HttpError(404, "Sessão de upload não encontrada.");
    }
    try {
      const etag = await storage.writePart(key, uploadId, Number(params.get("part")), body, max);
      return json({ ok: true, etag }, { headers: { ETag: etag } });
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  }
  try {
    const size = await storage.writeStream(key, body, max, asset.mime);
    return json({ ok: true, size });
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
