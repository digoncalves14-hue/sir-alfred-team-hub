/**
 * Entrega a versão web do Jarvis (Expo exportado com `expo export --platform web`)
 * pelo próprio backend: um único endereço HTTPS para o app e a API.
 *
 * - Injeta no index.html a configuração PÚBLICA (URL e chave publishable/anon do Supabase)
 *   e as tags para "Adicionar à Tela de Início" no iPhone. Nenhum segredo vai ao navegador.
 * - Rotas desconhecidas do app voltam para o index.html (o roteador do app resolve).
 * - Bloqueia caminhos fora da pasta (path traversal).
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import type { FastifyInstance } from "fastify";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

export interface WebAppOptions {
  dir: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/** Escapa JSON para uso dentro de <script> (evita fechar a tag). */
const safeJson = (v: unknown) =>
  JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(new RegExp("\\u2028", "g"), "\\u2028")
    .replace(new RegExp("\\u2029", "g"), "\\u2029");

export function renderIndex(html: string, opts: Pick<WebAppOptions, "supabaseUrl" | "supabaseAnonKey">): string {
  const head = [
    `<script>window.__JARVIS__=${safeJson({ supabaseUrl: opts.supabaseUrl, supabaseAnonKey: opts.supabaseAnonKey })};</script>`,
    `<link rel="manifest" href="/manifest.json">`,
    `<link rel="apple-touch-icon" href="/icon-180.png">`,
    `<meta name="apple-mobile-web-app-capable" content="yes">`,
    `<meta name="mobile-web-app-capable" content="yes">`,
    `<meta name="apple-mobile-web-app-title" content="Jarvis">`,
    `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`,
    `<meta name="theme-color" content="#03060F">`,
  ].join("");
  let out = html.replace(/<head>/i, `<head>${head}`);
  // Ocupa a tela toda (inclusive atrás da barra de status) e evita zoom ao focar campos.
  out = out.replace(/<meta name="viewport"[^>]*>/i, `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">`);
  out = out.replace(/<title>[^<]*<\/title>/i, "<title>JARVIS AI</title>");
  out = out.replace(/<html lang="[^"]*"/i, '<html lang="pt-BR"');
  return out;
}

export function isWebAppAvailable(dir: string | undefined): dir is string {
  return Boolean(dir && existsSync(join(dir, "index.html")));
}

export async function registerWebApp(app: FastifyInstance, opts: WebAppOptions) {
  const root = resolve(opts.dir);
  const index = renderIndex(readFileSync(join(root, "index.html"), "utf8"), opts);

  const sendIndex = (reply: import("fastify").FastifyReply) =>
    reply
      .header("content-type", TYPES[".html"])
      .header("cache-control", "no-cache")
      .header("x-content-type-options", "nosniff")
      .header("referrer-policy", "no-referrer")
      .header("x-frame-options", "DENY")
      .send(index);

  app.get("/*", { config: { rateLimit: false } }, async (req, reply) => {
    const path = decodeURIComponent((req.url.split("?")[0] ?? "/").replace(/\/+$/, "") || "/");
    // A API e rotas internas nunca caem no app.
    if (path.startsWith("/v1/") || path === "/v1" || path.startsWith("/internal/")) {
      return reply.status(404).send({ error: { code: "nao_encontrado", message: "Rota não encontrada." } });
    }
    if (path === "/" || path === "/index.html") return sendIndex(reply);

    const file = resolve(root, `.${path}`);
    if (file !== root && !file.startsWith(root + sep)) return reply.status(404).send();
    let isFile = false;
    try {
      isFile = statSync(file).isFile();
    } catch {
      isFile = false;
    }
    if (!isFile) {
      // Arquivo com extensão inexistente → 404; caminho do app (ex.: /settings) → index.html.
      return extname(path) ? reply.status(404).send() : sendIndex(reply);
    }
    const immutable = path.startsWith("/_expo/static/") || path.startsWith("/assets/");
    return reply
      .header("content-type", TYPES[extname(file).toLowerCase()] ?? "application/octet-stream")
      .header("cache-control", immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600")
      .header("x-content-type-options", "nosniff")
      .send(createReadStream(file));
  });
}
