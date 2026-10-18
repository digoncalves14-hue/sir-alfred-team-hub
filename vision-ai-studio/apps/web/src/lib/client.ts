"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** fetch para as rotas da API com mensagens de erro em português vindas do servidor. */
export async function apiFetch<T = unknown>(path: string, opts: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...init } = opts;
  const res = await fetch(path, {
    ...init,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : init.body,
    credentials: "same-origin",
  });
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth")) {
    window.location.href = "/entrar";
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Erro ${res.status}`);
  return data as T;
}
