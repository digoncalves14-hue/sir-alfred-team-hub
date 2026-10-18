"use client";
import { apiFetch } from "./client";

type Target =
  | { mode: "single"; method: "PUT"; url: string; headers: Record<string, string> }
  | { mode: "multipart"; uploadId: string; partSize: number; parts: Array<{ partNumber: number; url: string }> };

export interface UploadOptions {
  role: "source" | "music" | "logo";
  projectId?: string | null;
  brandId?: string | null;
  licenseNote?: string | null;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

function put(url: string, body: Blob, headers: Record<string, string>, onProgress: (loaded: number) => void, signal?: AbortSignal) {
  return new Promise<string | null>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.getResponseHeader("ETag")) : reject(new Error(uploadError(xhr))));
    xhr.onerror = () => reject(new Error("Falha de rede durante o upload."));
    xhr.onabort = () => reject(new Error("Upload cancelado."));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(body);
  });
}

function uploadError(xhr: XMLHttpRequest): string {
  try {
    return JSON.parse(xhr.responseText).error ?? `Erro ${xhr.status} no upload.`;
  } catch {
    return `Erro ${xhr.status} no upload.`;
  }
}

/** Upload direto ao armazenamento (URL assinada), com multipart e progresso real. */
export async function uploadFile(file: File, opts: UploadOptions): Promise<string> {
  const { assetId, target } = await apiFetch<{ assetId: string; target: Target }>("/api/uploads", {
    method: "POST",
    json: {
      role: opts.role,
      fileName: file.name,
      sizeBytes: file.size,
      mime: file.type,
      projectId: opts.projectId ?? null,
      brandId: opts.brandId ?? null,
      licenseNote: opts.licenseNote ?? null,
    },
  });
  const report = (loaded: number) => opts.onProgress?.(Math.min(1, loaded / file.size));
  if (target.mode === "single") {
    await put(target.url, file, target.headers, report, opts.signal);
    await apiFetch(`/api/uploads/${assetId}/complete`, { method: "POST", json: {} });
    return assetId;
  }
  const done: Array<{ partNumber: number; etag: string }> = [];
  const loadedByPart = new Map<number, number>();
  const queue = [...target.parts];
  const worker = async () => {
    for (let part = queue.shift(); part; part = queue.shift()) {
      const start = (part.partNumber - 1) * target.partSize;
      const blob = file.slice(start, Math.min(file.size, start + target.partSize));
      const etag = await put(part.url, blob, {}, (l) => {
        loadedByPart.set(part!.partNumber, l);
        report([...loadedByPart.values()].reduce((a, b) => a + b, 0));
      }, opts.signal);
      if (!etag) throw new Error("O armazenamento não retornou o ETag (verifique o CORS do bucket).");
      done.push({ partNumber: part.partNumber, etag });
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  await apiFetch(`/api/uploads/${assetId}/complete`, { method: "POST", json: { parts: done } });
  return assetId;
}
