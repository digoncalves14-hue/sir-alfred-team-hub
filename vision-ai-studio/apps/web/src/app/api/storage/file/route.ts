import path from "node:path";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { LocalStorage, getStorage, verifyLocalUrl } from "@vision/server";
import { HttpError, publicApi } from "@/lib/api";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska", ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg", ".flac": "audio/flac",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".srt": "application/x-subrip",
};

/** Entrega arquivos do driver local via URL assinada, com suporte a Range (busca no player). */
export const GET = publicApi(async (req: NextRequest) => {
  const storage = getStorage();
  if (!(storage instanceof LocalStorage)) throw new HttpError(404, "Rota disponível apenas com armazenamento local.");
  const params = req.nextUrl.searchParams;
  const key = verifyLocalUrl("get", params, params.has("dl") ? ["dl"] : []);
  if (!key) throw new HttpError(403, "Link inválido ou expirado.");
  const st = await storage.stat(key);
  if (!st) throw new HttpError(404, "Arquivo não encontrado.");
  const type = TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  const dl = params.get("dl");
  if (dl) headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(dl)}`;
  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && st.size > 0) {
    let start = range[1] ? Number(range[1]) : st.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : st.size - 1;
    start = Math.max(0, start);
    end = Math.min(st.size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${st.size}` } });
    const stream = Readable.toWeb(storage.createReadStream(key, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(storage.createReadStream(key)) as ReadableStream;
  return new Response(stream, { status: 200, headers: { ...headers, "Content-Length": String(st.size) } });
});
