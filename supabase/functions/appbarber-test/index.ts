import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const PROXY_URL = Deno.env.get('APPBARBER_PROXY_URL')?.replace(/\/$/, '');
const PROXY_TOKEN = Deno.env.get('APPBARBER_PROXY_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Endpoint = { name: string; path: string };

async function callProxy(baseUrl: string, path: string) {
  if (!PROXY_URL || !PROXY_TOKEN) {
    return { status: 500, rate_remaining: null, body: { error: 'Proxy AppBarber não configurado' } };
  }
  try {
    const r = await fetch(PROXY_URL + path, {
      headers: {
        'X-Proxy-Token': PROXY_TOKEN,
        'X-Target-Base': baseUrl,
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

  let override: { base_url?: string; endpoints?: Endpoint[] } = {};
  if (req.method === 'POST') {
    try { override = await req.json(); } catch { /* ignore */ }
  }

  let baseUrl = String(override.base_url ?? '').replace(/\/$/, '');
  let endpoints: Endpoint[] = Array.isArray(override.endpoints) ? override.endpoints : [];

  if (!baseUrl || endpoints.length === 0) {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: cfg, error } = await admin
      .from('appbarber_config')
      .select('base_url, endpoints')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !cfg) {
      return new Response(
        JSON.stringify({ error: 'Configuração não encontrada. Salve na aba Configurações AppBarber.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!baseUrl) baseUrl = String(cfg.base_url ?? '').replace(/\/$/, '');
    if (endpoints.length === 0) endpoints = Array.isArray(cfg.endpoints) ? (cfg.endpoints as Endpoint[]) : [];
  }

  const results: Record<string, unknown> = { base_url: baseUrl };
  for (const ep of endpoints) {
    if (!ep?.path) continue;
    results[ep.name || ep.path] = { path: ep.path, ...(await callProxy(baseUrl, ep.path)) };
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
