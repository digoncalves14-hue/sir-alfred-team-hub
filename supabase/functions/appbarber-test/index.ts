import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const PROXY_URL = Deno.env.get('APPBARBER_PROXY_URL')?.replace(/\/$/, '');
const PROXY_TOKEN = Deno.env.get('APPBARBER_PROXY_TOKEN');
const UNITS: Record<string, number> = { Birigui: 709052, Aracatuba: 18653137 };

async function call(path: string) {
  if (!PROXY_URL || !PROXY_TOKEN) {
    return {
      path,
      status: 500,
      body: { error: 'Proxy AppBarber não configurado' },
    };
  }

  const r = await fetch(PROXY_URL + path, {
    headers: { 'X-Proxy-Token': PROXY_TOKEN, 'Accept': 'application/json' },
  });
  const text = await r.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch {}
  return {
    path,
    status: r.status,
    rate_remaining: r.headers.get('X-RateLimit-Remaining'),
    body,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const results: Record<string, unknown> = {};
  for (const [unit, code] of Object.entries(UNITS)) {
    results[unit] = {
      services: await call(`/v1/services?establishment_code=${code}`),
      professionals: await call(`/v1/professionals?establishment_code=${code}`),
    };
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
