/**
 * Build para a Vercel (Build Output API v3), a partir da pasta jarvis-ai/:
 *   - .vercel/output/static            → app web (Expo exportado) com a config pública do Supabase
 *   - .vercel/output/functions/api.func → servidor Fastify empacotado numa função Node
 *   - .vercel/output/config.json        → rotas: API na função, resto no app
 * Variáveis necessárias no build: SUPABASE_URL e SUPABASE_ANON_KEY (públicas).
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { renderIndex } from "../apps/server/src/web/static";

const root = resolve(import.meta.dirname, "..");
const out = join(root, ".vercel", "output");
const rawUrl = (process.env.SUPABASE_URL ?? "").trim();
// Aceita o endereço copiado com caminho (ex.: .../rest/v1/) e usa só a origem.
const supabaseUrl = rawUrl ? new URL(rawUrl).origin : "";
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY ?? "").trim();
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Defina SUPABASE_URL e SUPABASE_ANON_KEY nas variáveis de ambiente do projeto na Vercel.");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1) App web
const staticDir = join(out, "static");
execSync(`npx expo export --platform web --output-dir "${staticDir}"`, {
  cwd: join(root, "apps", "mobile"),
  stdio: "inherit",
  env: { ...process.env, EXPO_NO_TELEMETRY: "1", CI: "1" },
});
const indexPath = join(staticDir, "index.html");
writeFileSync(indexPath, renderIndex(readFileSync(indexPath, "utf8"), { supabaseUrl, supabaseAnonKey }));

// 2) Função do servidor
const fnDir = join(out, "functions", "api.func");
mkdirSync(fnDir, { recursive: true });
await build({
  entryPoints: [join(root, "apps", "server", "src", "vercel.ts")],
  outfile: join(fnDir, "index.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  legalComments: "none",
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
});
writeFileSync(
  join(fnDir, ".vc-config.json"),
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, supportsResponseStreaming: true, maxDuration: 60 }, null, 2),
);

// 3) Rotas
writeFileSync(
  join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "^/((?:v1|internal|health)(?:/.*)?)$", dest: "/api?__jarvis_path=/$1" },
        { src: "^/(_expo/static|assets)/(.*)$", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
        { src: "^/(?:index\\.html)?$", headers: { "cache-control": "no-cache" }, continue: true },
        { handle: "filesystem" },
        { src: "^/(?!.*\\.[A-Za-z0-9]+$).*$", dest: "/index.html", headers: { "cache-control": "no-cache" } },
      ],
    },
    null,
    2,
  ),
);
console.log("Build da Vercel pronto em", out);
