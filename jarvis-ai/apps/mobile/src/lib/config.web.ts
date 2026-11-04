/**
 * Configuração pública da versão web. O próprio backend entrega o app e injeta
 * `window.__JARVIS__` (URL e chave PÚBLICA do Supabase) no index.html; a API fica
 * no mesmo endereço do site. Nenhum segredo chega ao navegador.
 */
type Injected = { supabaseUrl?: string; supabaseAnonKey?: string };
const injected: Injected = (typeof window !== "undefined" && (window as unknown as { __JARVIS__?: Injected }).__JARVIS__) || {};

export const config = {
  supabaseUrl: injected.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: injected.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
  apiUrl: (process.env.EXPO_PUBLIC_API_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/+$/, ""),
};

export const missingConfig = (Object.entries(config) as [string, string][])
  .filter(([, v]) => !v)
  .map(([k]) => k);
