import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const PROXY_URL = Deno.env.get('APPBARBER_PROXY_URL')?.replace(/\/$/, '');
const PROXY_TOKEN = Deno.env.get('APPBARBER_PROXY_TOKEN');
let API_KEY = Deno.env.get('APPBARBER_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Endpoint = { name: string; path: string; method?: string; body?: Record<string, unknown> };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function callProxy(baseUrl: string, path: string, method = 'GET', extraBody?: Record<string, unknown>) {
  if (!PROXY_URL || !PROXY_TOKEN) {
    return { status: 500, rate_remaining: null, body: { error: 'Proxy AppBarber não configurado' } };
  }
  try {
    // A API da AppBarber espera a chave como parâmetro API_KEY; mandamos também nos headers.
    const withKey = API_KEY
      ? path + (path.includes('?') ? '&' : '?') + 'API_KEY=' + encodeURIComponent(API_KEY)
      : path;

    const isPost = method.toUpperCase() === 'POST';
    const form = new URLSearchParams();
    if (API_KEY) form.set('API_KEY', API_KEY);
    for (const [k, v] of Object.entries(extraBody ?? {})) form.set(k, String(v));

    const r = await fetch(PROXY_URL + withKey, {
      method: method.toUpperCase(),
      body: isPost ? form.toString() : undefined,
      headers: {
        ...(isPost ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        'X-Proxy-Token': PROXY_TOKEN,
        'X-Target-Base': baseUrl,
        'API_KEY': API_KEY,
        'X-API-Key': API_KEY,
        'Accept': 'application/json',
      },
    });
    const text = await r.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep text */ }
    return { status: r.status, rate_remaining: r.headers.get('X-RateLimit-Remaining'), body };
  } catch (err) {
    return { status: 0, rate_remaining: null, body: { error: String(err) } };
  }
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // --- Autenticação obrigatória: só gestores autenticados podem usar esta função ---
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  const userId = claimsData?.claims?.sub as string | undefined;
  if (claimsError || !userId) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: isGestor } = await admin.rpc('has_role', { _user_id: userId, _role: 'gestor' });
  if (!isGestor) return json({ error: 'Forbidden' }, 403);

  // Chave cadastrada pelo gestor na tela de configurações tem prioridade sobre a variável de ambiente.
  try {
    const { data: cred } = await admin
      .from('appbarber_credentials')
      .select('api_key')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cred?.api_key) API_KEY = cred.api_key;
  } catch { /* mantém a chave do ambiente */ }

  // A configuração vem SEMPRE do servidor — o corpo da requisição não pode
  // redirecionar a chave para um destino escolhido pelo chamador.
  const { data: cfg, error: cfgError } = await admin
    .from('appbarber_config')
    .select('base_url, endpoints')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cfgError || !cfg) {
    return json({ error: 'Configuração não encontrada. Salve na aba Configurações AppBarber.' }, 400);
  }

  const baseUrl = String(cfg.base_url ?? '').replace(/\/$/, '');
  const endpoints: Endpoint[] = Array.isArray(cfg.endpoints) ? (cfg.endpoints as Endpoint[]) : [];

  const results: Record<string, unknown> = { base_url: baseUrl };
  for (const ep of endpoints) {
    if (!ep?.path) continue;
    results[ep.name || ep.path] = { path: ep.path, method: ep.method ?? 'GET', ...(await callProxy(baseUrl, ep.path, ep.method ?? 'GET', ep.body)) };
  }

  return json(results);
});
