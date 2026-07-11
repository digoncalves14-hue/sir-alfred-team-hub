import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const API_KEY = Deno.env.get('APPBARBER_API_KEY')!;
const UNITS: Record<string, string> = {
  Birigui: '709052',
  Aracatuba: '18653137',
};

// Candidate base URLs / auth header styles to probe.
const BASES = [
  'https://api.appbarber.com.br',
  'https://api.appbarber.com.br/v1',
  'https://api.appbarber.io',
  'https://api.appbarber.io/v1',
];
const PATHS = [
  '/professionals',
  '/professional',
  '/estabelecimento/{code}/professionals',
  '/establishments/{code}/professionals',
  '/appointments',
];

async function tryFetch(url: string, headerStyle: string, code: string) {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (headerStyle === 'bearer') headers['Authorization'] = `Bearer ${API_KEY}`;
  if (headerStyle === 'xapikey') headers['X-API-Key'] = API_KEY;
  if (headerStyle === 'apikey') headers['apikey'] = API_KEY;
  const full = url.replace('{code}', code);
  try {
    const r = await fetch(full, { headers });
    const text = await r.text();
    return { url: full, headerStyle, status: r.status, sample: text.slice(0, 400) };
  } catch (e) {
    return { url: full, headerStyle, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const only = url.searchParams.get('only'); // "birigui" | "aracatuba" | null
  const customPath = url.searchParams.get('path'); // e.g. /v1/professionals
  const customBase = url.searchParams.get('base');

  const results: any[] = [];
  const codes = only
    ? { [only]: UNITS[Object.keys(UNITS).find(k => k.toLowerCase() === only.toLowerCase())!] }
    : UNITS;

  if (customPath && customBase) {
    for (const [unit, code] of Object.entries(codes)) {
      for (const style of ['bearer', 'xapikey', 'apikey']) {
        results.push({ unit, ...(await tryFetch(customBase + customPath, style, code)) });
      }
    }
  } else {
    // Probe combinations for first unit only to keep noise low.
    const [unit, code] = Object.entries(codes)[0];
    for (const base of BASES) {
      for (const path of PATHS) {
        for (const style of ['bearer', 'xapikey', 'apikey']) {
          const res = await tryFetch(base + path, style, code);
          if ((res as any).status && (res as any).status !== 404) {
            results.push({ unit, ...res });
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ tested: results.length, results }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
