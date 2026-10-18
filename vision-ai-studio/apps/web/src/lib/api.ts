import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { LimitError, log } from "@vision/server";
import { getSession, type SessionInfo } from "./session";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "Recurso") => new HttpError(404, `${what} não encontrado.`);

type Params = Record<string, string>;
type Handler = (req: NextRequest, ctx: { session: SessionInfo; params: Params }) => Promise<Response>;

/**
 * Envolve uma rota de API: autenticação, verificação de origem em métodos de
 * escrita (proteção CSRF junto ao cookie SameSite=Lax) e erros padronizados.
 */
export function api(fn: Handler) {
  return async (req: NextRequest, route: { params: Promise<Params> }) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      const session = await getSession();
      if (!session) throw new HttpError(401, "Faça login para continuar.");
      return await fn(req, { session, params: await route.params });
    } catch (err) {
      return errorResponse(err, req);
    }
  };
}

export function publicApi(fn: (req: NextRequest, params: Params) => Promise<Response>) {
  return async (req: NextRequest, route: { params: Promise<Params> }) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "PUT") assertSameOrigin(req);
      return await fn(req, await route.params);
    } catch (err) {
      return errorResponse(err, req);
    }
  };
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, "Origem da requisição não permitida.");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(403, "Origem da requisição inválida.");
  }
}

export function errorResponse(err: unknown, req?: NextRequest) {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "Dados inválidos.", issues: err.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  }
  if (err instanceof LimitError) return NextResponse.json({ error: err.message }, { status: 402 });
  log.error("api_error", { path: req?.nextUrl.pathname, err: err as Error });
  return NextResponse.json({ error: "Erro interno. Tente novamente." }, { status: 500 });
}

export async function readJson<T>(req: NextRequest, schema: { parse: (v: unknown) => T }): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Corpo da requisição inválido.");
  }
  return schema.parse(body);
}

export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);
