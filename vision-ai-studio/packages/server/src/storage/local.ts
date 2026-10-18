import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { getConfig } from "../config";
import { isSafeKey } from "./keys";
import { signedLocalUrl } from "./signing";
import type { StorageDriver, UploadTarget } from "./types";

/**
 * Armazenamento em disco local — para desenvolvimento e instalações de um único
 * servidor. Uploads/downloads usam URLs assinadas e temporárias servidas pela
 * própria aplicação (com suporte a Range para o player de vídeo).
 */
export class LocalStorage implements StorageDriver {
  readonly kind = "local" as const;
  constructor(private root = path.resolve(getConfig().LOCAL_STORAGE_DIR)) {}

  resolve(key: string): string {
    if (!isSafeKey(key)) throw new Error("Chave de armazenamento inválida.");
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root + path.sep)) throw new Error("Chave de armazenamento inválida.");
    return p;
  }

  async createUpload(key: string, _contentType: string, sizeBytes: number): Promise<UploadTarget> {
    this.resolve(key);
    const url = signedLocalUrl("put", key, getConfig().SIGNED_URL_TTL_SEC * 6, { max: String(sizeBytes) });
    return { mode: "single", method: "PUT", url, headers: {} };
  }

  async completeUpload(key: string): Promise<void> {
    const s = await this.stat(key);
    if (!s) throw new Error("Upload não encontrado no armazenamento.");
  }

  async abortUpload(key: string): Promise<void> {
    await this.delete(key);
  }

  async getDownloadUrl(key: string, opts: { expiresSec?: number; downloadName?: string } = {}): Promise<string> {
    const extra: Record<string, string> = {};
    if (opts.downloadName) extra.dl = opts.downloadName.replace(/[^\p{L}\p{N} ._-]/gu, "_").slice(0, 120);
    return signedLocalUrl("get", key, opts.expiresSec ?? getConfig().SIGNED_URL_TTL_SEC, extra);
  }

  async stat(key: string): Promise<{ size: number } | null> {
    try {
      const s = await stat(this.resolve(key));
      return { size: s.size };
    } catch {
      return null;
    }
  }

  async materialize(key: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
    const p = this.resolve(key);
    await stat(p);
    return { path: p, cleanup: async () => {} };
  }

  /** Grava um stream recebido pela rota de upload, respeitando o tamanho máximo. */
  async writeStream(key: string, body: AsyncIterable<Uint8Array>, maxBytes: number): Promise<number> {
    const p = this.resolve(key);
    await mkdir(path.dirname(p), { recursive: true });
    let total = 0;
    const tmp = `${p}.part`;
    try {
      await pipeline(
        async function* () {
          for await (const chunk of body) {
            total += chunk.byteLength;
            if (total > maxBytes) throw new Error("Arquivo maior que o tamanho declarado.");
            yield chunk;
          }
        },
        createWriteStream(tmp),
      );
      await rename(tmp, p);
      return total;
    } finally {
      await rm(tmp, { force: true });
    }
  }

  createReadStream(key: string, range?: { start: number; end: number }) {
    return createReadStream(this.resolve(key), range);
  }

  async uploadFile(localPath: string, key: string): Promise<number> {
    const p = this.resolve(key);
    await mkdir(path.dirname(p), { recursive: true });
    await pipeline(createReadStream(localPath), createWriteStream(p));
    return (await stat(p)).size;
  }

  async putBuffer(key: string, data: Buffer): Promise<void> {
    const p = this.resolve(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
  }

  async getBuffer(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}
