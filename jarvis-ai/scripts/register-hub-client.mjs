#!/usr/bin/env node
/**
 * Registra o JARVIS AI como cliente OAuth PÚBLICO (PKCE, sem segredo) no Sir Alfred Team Hub,
 * usando o registro dinâmico de clientes (RFC 7591) do Supabase Auth.
 *
 * Uso:  node scripts/register-hub-client.mjs https://SEU-PROJETO-DO-HUB.supabase.co
 * Saída: o client_id para colocar em HUB_OAUTH_CLIENT_ID (apps/server/.env).
 *
 * Se o registro dinâmico estiver desligado no Hub, o script explica como cadastrar pelo painel.
 */
const hub = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(hub)) {
  console.error("Informe a URL do Supabase do Hub, ex.: node scripts/register-hub-client.mjs https://abcd1234.supabase.co");
  process.exit(1);
}
const REDIRECT = "jarvis://hub-oauth";

const discovery = await fetch(`${hub}/.well-known/oauth-authorization-server/auth/v1`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
if (!discovery) {
  console.error("O servidor OAuth 2.1 do Hub não respondeu. Ative em Supabase › Authentication › OAuth Server.");
  process.exit(1);
}
console.log(`Servidor OAuth encontrado: ${discovery.issuer}`);

const manual = () => {
  console.log(`
Cadastre manualmente no painel do Supabase do Hub:
  Authentication › OAuth Apps › Add a new client
    Nome: JARVIS AI
    Redirect URI: ${REDIRECT}
    Tipo: Public (sem segredo)
Depois copie o Client ID para HUB_OAUTH_CLIENT_ID em apps/server/.env.`);
};

if (!discovery.registration_endpoint) {
  console.log("Registro dinâmico de clientes está DESLIGADO neste Hub.");
  manual();
  process.exit(0);
}

const res = await fetch(discovery.registration_endpoint, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify({
    client_name: "JARVIS AI",
    redirect_uris: [REDIRECT],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok || !body.client_id) {
  console.log(`O Hub recusou o registro automático (${res.status}): ${JSON.stringify(body)}`);
  manual();
  process.exit(1);
}
console.log(`\nCliente registrado.\n  HUB_SUPABASE_URL=${hub}\n  HUB_OAUTH_CLIENT_ID=${body.client_id}\nA chave pública (publishable/anon) do Hub vai em HUB_PUBLISHABLE_KEY.`);
