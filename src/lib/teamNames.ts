import { supabase } from "@/integrations/supabase/client";

export const normalizeName = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/** Nomes dos profissionais cadastrados (tabela profiles). */
export async function fetchTeamNames(): Promise<string[]> {
  const { data } = await supabase.from("profiles").select("nome").order("nome");
  return (data ?? []).map((p: any) => p.nome).filter(Boolean);
}

export async function fetchMyName(userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("nome").eq("id", userId).maybeSingle();
  return (data as any)?.nome ?? "";
}
