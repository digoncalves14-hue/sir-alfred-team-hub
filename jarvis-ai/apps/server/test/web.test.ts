import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { isEmailAllowed, parseAllowedEmails } from "../src/auth";
import { Orchestrator, WEB_EXCLUDED_TOOLS } from "../src/agent/orchestrator";
import { loadConfig } from "../src/config";
import { AppError } from "../src/errors";
import { GoogleOAuth } from "../src/google/oauth";
import { SecretBox } from "../src/security/crypto";
import { createMemoryDb, MemoryUserStore } from "../src/store/memory-store";
import { createDefaultRegistry } from "../src/tools/builtin";
import { ElevenLabsTts } from "../src/tts/elevenlabs";
import { renderIndex } from "../src/web/static";
import { ScriptedProvider, call, text } from "./fake-provider";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const db = createMemoryDb();
const provider = new ScriptedProvider([]);
const script = (...steps: ConstructorParameters<typeof ScriptedProvider>[0]) => {
  (provider as unknown as { steps: unknown[] }).steps = steps;
};
const orchestrator = new Orchestrator({ provider, registry: createDefaultRegistry(), maxToolIterations: 6, historyMessages: 4 });

const dir = mkdtempSync(join(tmpdir(), "jarvis-web-"));
mkdirSync(join(dir, "_expo", "static", "js"), { recursive: true });
writeFileSync(join(dir, "index.html"), '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>x</title></head><body></body></html>');
writeFileSync(join(dir, "_expo", "static", "js", "app-123.js"), "console.log(1)");
writeFileSync(join(dir, "manifest.json"), "{}");
writeFileSync(join(tmpdir(), "jarvis-secret.txt"), "segredo");

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  app = await buildApp({
    logger: false,
    authenticate: async (token) => {
      if (token !== "token-a") throw new AppError("nao_autenticado", 401, "Sessão inválida");
      return new MemoryUserStore(A, db);
    },
    provider,
    tts: new ElevenLabsTts({ modelId: "x" }),
    ttsCostPer1kChars: 0.1,
    rateLimitPerMinute: 3,
    orchestrator,
    web: { dir, supabaseUrl: "https://abc.supabase.co", supabaseAnonKey: "sb_publishable_</script><script>alert(1)" },
  });
});
afterAll(() => app.close());

describe("versão web servida pelo backend", () => {
  it("injeta só a configuração pública, escapada, e as tags de app da Tela de Início", () => {
    const html = renderIndex('<html lang="en"><head><title>x</title></head></html>', { supabaseUrl: "https://abc.supabase.co", supabaseAnonKey: "k</script>" });
    expect(html).toContain('window.__JARVIS__={"supabaseUrl":"https://abc.supabase.co","supabaseAnonKey":"k\\u003c/script>"}');
    expect(html).not.toContain("k</script>");
    expect(html).toContain('lang="pt-BR"');
    expect(html).toContain("apple-mobile-web-app-capable");
    expect(html).toContain('<link rel="manifest" href="/manifest.json">');
  });

  it("entrega o app, arquivos estáticos e cai no index para rotas do app", async () => {
    const root = await app.inject({ url: "/" });
    expect(root.statusCode).toBe(200);
    expect(root.headers["content-type"]).toContain("text/html");
    expect(root.headers["cache-control"]).toBe("no-cache");
    expect(root.payload).toContain("window.__JARVIS__");
    expect(root.payload).not.toContain("</script><script>alert(1)");

    const route = await app.inject({ url: "/settings?x=1" });
    expect(route.statusCode).toBe(200);
    expect(route.payload).toContain("window.__JARVIS__");

    const js = await app.inject({ url: "/_expo/static/js/app-123.js" });
    expect(js.statusCode).toBe(200);
    expect(js.headers["content-type"]).toContain("text/javascript");
    expect(js.headers["cache-control"]).toContain("immutable");

    expect((await app.inject({ url: "/nao-existe.js" })).statusCode).toBe(404);
  });

  it("não deixa sair da pasta do app nem engole rotas da API", async () => {
    for (const url of ["/../jarvis-secret.txt", "/%2e%2e/jarvis-secret.txt", "/..%2fjarvis-secret.txt"]) {
      const r = await app.inject({ url });
      expect(r.payload).not.toContain("segredo");
    }
    const api = await app.inject({ url: "/v1/nao-existe", headers: { authorization: "Bearer token-a" } });
    expect(api.statusCode).toBe(404);
    expect(api.headers["content-type"]).toContain("application/json");
    expect((await app.inject({ url: "/v1/me" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/health" })).json()).toMatchObject({ ok: true });
  });

  it("arquivos do app não contam no limite de requisições por minuto", async () => {
    for (let i = 0; i < 10; i++) expect((await app.inject({ url: "/manifest.json" })).statusCode).toBe(200);
  });
});

describe("conversa a partir da versão web", () => {
  it("não oferece ferramentas que dependem do iPhone e avisa o modelo", async () => {
    script(text("Certo."));
    const store = new MemoryUserStore(A, db);
    await orchestrator.runTurn(store, { message: "me lembra de pagar a conta", inputMode: "text", client: "web" });
    const req = provider.requests.at(-1)!;
    const names = req.tools.map((t) => t.name);
    for (const t of WEB_EXCLUDED_TOOLS) expect(names).not.toContain(t);
    expect(names).toContain("abrir_comunicacao");
    expect(req.context).toContain("versão WEB");

    script(text("Ok."));
    await orchestrator.runTurn(store, { message: "oi", inputMode: "text" });
    expect(provider.requests.at(-1)!.tools.map((t) => t.name)).toContain("iphone_criar_lembrete");
  });

  it("recusa uma ferramenta do iPhone mesmo se o modelo tentar chamá-la na web", async () => {
    script(call("iphone_criar_lembrete", { titulo: "Pagar conta" }), text("Não consegui."));
    const store = new MemoryUserStore(A, db);
    const before = (await store.listPendingActions()).length;
    await orchestrator.runTurn(store, { message: "lembrete", inputMode: "text", client: "web" });
    expect((await store.listPendingActions()).length).toBe(before);
    const result = provider.requests.at(-1)!.turns.at(-1)!.parts[0] as { type: string; isError?: boolean };
    expect(result).toMatchObject({ type: "tool_result", isError: true });
  });
});

describe("Google na versão web", () => {
  it("usa o cliente Web: redireciona para a página do Jarvis e envia o segredo só ao Google", async () => {
    const bodies: string[] = [];
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""));
      return new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "https://www.googleapis.com/auth/calendar.events" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const box = new SecretBox(randomBytes(32).toString("base64"));
    const oauth = new GoogleOAuth("123-web.apps.googleusercontent.com", box, fakeFetch, {
      clientSecret: "GOCSPX-segredo",
      redirectUri: "https://jarvis.example.com/google-oauth",
    });
    const { authUrl, redirectUri } = oauth.start(A, ["calendar"]);
    expect(redirectUri).toBe("https://jarvis.example.com/google-oauth");
    expect(authUrl).toContain(encodeURIComponent("https://jarvis.example.com/google-oauth"));
    expect(authUrl).not.toContain("GOCSPX");
    const state = new URL(authUrl).searchParams.get("state")!;
    await oauth.complete(A, "codigo", state);
    expect(bodies[0]).toContain("client_secret=GOCSPX-segredo");
    expect(bodies[0]).toContain(`redirect_uri=${encodeURIComponent("https://jarvis.example.com/google-oauth")}`);
    await oauth.refresh("rt");
    expect(bodies.at(-1)).toContain("client_secret=GOCSPX-segredo");
  });

  it("o cliente iOS continua sem segredo", async () => {
    const bodies: string[] = [];
    const fakeFetch = (async (_u: string, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""));
      return new Response(JSON.stringify({ access_token: "a", expires_in: 3600 }), { status: 200 });
    }) as typeof fetch;
    const oauth = new GoogleOAuth("123-ios.apps.googleusercontent.com", new SecretBox(randomBytes(32).toString("base64")), fakeFetch);
    expect(oauth.redirectUri).toBe("com.googleusercontent.apps.123-ios:/oauth2redirect");
    await oauth.refresh("rt");
    expect(bodies[0]).not.toContain("client_secret");
  });
});

describe("configuração para hospedagem", () => {
  it("variáveis opcionais em branco contam como ausentes", () => {
    const cfg = loadConfig({
      SUPABASE_URL: "https://abc.supabase.co",
      SUPABASE_ANON_KEY: "sb_publishable_xxxxxxxxxxxxxxxx",
      GOOGLE_WEB_CLIENT_ID: "",
      VOYAGE_API_KEY: "  ",
      TRUST_PROXY: "true",
    });
    expect(cfg.GOOGLE_WEB_CLIENT_ID).toBeUndefined();
    expect(cfg.VOYAGE_API_KEY).toBeUndefined();
    expect(cfg.TRUST_PROXY).toBe(true);
  });

  it("usa só a origem do SUPABASE_URL, mesmo se copiado com caminho", () => {
    const cfg = loadConfig({ SUPABASE_URL: " https://abc.supabase.co/rest/v1/ ", SUPABASE_ANON_KEY: "sb_publishable_xxxxxxxxxxxxxxxx" });
    expect(cfg.SUPABASE_URL).toBe("https://abc.supabase.co");
  });

  it("aceita chave de cifra gerada pelo provedor (texto longo) e recusa chave curta", () => {
    const generated = randomBytes(48).toString("hex");
    const box = new SecretBox(generated);
    expect(box.decrypt(box.encrypt("ok"))).toBe("ok");
    expect(() => new SecretBox("curta")).toThrow(/32 bytes/);
  });
});

describe("contas autorizadas (ALLOWED_EMAILS)", () => {
  it("sem lista, qualquer conta; com lista, só os e-mails dela (sem diferenciar maiúsculas)", () => {
    expect(isEmailAllowed(parseAllowedEmails(undefined), "x@y.com")).toBe(true);
    expect(isEmailAllowed(parseAllowedEmails(" , "), "x@y.com")).toBe(true);
    const allowed = parseAllowedEmails("Dono@Gmail.com, socio@empresa.com");
    expect(isEmailAllowed(allowed, "dono@gmail.com")).toBe(true);
    expect(isEmailAllowed(allowed, "SOCIO@empresa.com")).toBe(true);
    expect(isEmailAllowed(allowed, "estranho@gmail.com")).toBe(false);
    expect(isEmailAllowed(allowed, null)).toBe(false);
  });
});

describe("função da Vercel", () => {
  it("restaura o caminho original da API e mantém a query", async () => {
    const { restoreUrl } = await import("../src/vercel");
    expect(restoreUrl("/api?__jarvis_path=/v1/memories&q=barba")).toBe("/v1/memories?q=barba");
    expect(restoreUrl("/api?__jarvis_path=%2Fhealth")).toBe("/health");
    expect(restoreUrl("/v1/me")).toBe("/v1/me");
    expect(restoreUrl("/api?__jarvis_path=https://evil.com")).toBe("/api?__jarvis_path=https://evil.com");
  });
});
