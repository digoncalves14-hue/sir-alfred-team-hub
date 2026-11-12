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

/** Sem nenhum byte enviado por este tempo, a conexão é considerada travada e a parte é reenviada. */
const STALL_MS = 45_000;

function put(url: string, body: Blob, headers: Record<string, string>, onProgress: (loaded: number) => void, signal?: AbortSignal) {
  return new Promise<string | null>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastActivity = Date.now();
    let stalled = false;
    // conexões móveis/Wi-Fi às vezes param sem erro: o navegador espera para sempre
    const watchdog = setInterval(() => {
      if (Date.now() - lastActivity > STALL_MS) {
        stalled = true;
        xhr.abort();
      }
    }, 5_000);
    const finish = () => clearInterval(watchdog);
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      lastActivity = Date.now();
      onProgress(e.loaded);
    };
    // depois do último byte, o servidor ainda pode levar um tempo para responder
    xhr.upload.onload = () => (lastActivity = Date.now() + 60_000);
    xhr.onload = () => {
      finish();
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.getResponseHeader("ETag") ?? bodyEtag(xhr));
      else reject(new UploadError(uploadError(xhr), xhr.status));
    };
    xhr.onerror = () => {
      finish();
      reject(new UploadError("Falha de rede durante o upload.", 0));
    };
    xhr.onabort = () => {
      finish();
      reject(stalled ? new UploadError("A conexão parou durante o upload.", 0) : new Error("Upload cancelado."));
    };
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(body);
  });
}

class UploadError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function bodyEtag(xhr: XMLHttpRequest): string | null {
  try {
    return JSON.parse(xhr.responseText).etag ?? null;
  } catch {
    return null;
  }
}

/** Repete a parte em falhas de rede/servidor (5xx), com espera crescente. */
async function putWithRetry(...args: Parameters<typeof put>): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await put(...args);
    } catch (e) {
      const retriable = e instanceof UploadError && (e.status === 0 || e.status >= 500);
      if (!retriable || attempt >= 3 || args[4]?.aborted) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
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
    await putWithRetry(target.url, file, target.headers, report, opts.signal);
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
      const etag = await putWithRetry(part.url, blob, {}, (l) => {
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
