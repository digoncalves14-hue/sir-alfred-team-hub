/**
 * Configuração pública do app (embutida no bundle). Nunca coloque segredos aqui:
 * a chave da IA fica SOMENTE no backend.
 */
export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, ""),
};

export const missingConfig = (Object.entries(config) as [string, string][])
  .filter(([, v]) => !v)
  .map(([k]) => k);
