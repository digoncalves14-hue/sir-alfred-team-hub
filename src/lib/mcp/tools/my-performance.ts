import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function db(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "my_performance",
  title: "Meu desempenho",
  description: "Retorna os snapshots de desempenho (serviços, comandas, faturamento) do usuário autenticado, filtrando pelo nome do perfil.",
  inputSchema: {
    limit: z.number().int().min(1).max(24).optional().describe("Máximo de períodos (padrão 6)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const supabase = db(ctx);
    const uid = ctx.getUserId()!;
    const profile = await supabase.from("profiles").select("nome").eq("id", uid).maybeSingle();
    if (profile.error) return { content: [{ type: "text", text: profile.error.message }], isError: true };
    const nome = profile.data?.nome ?? "";
    const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const snaps = await supabase
      .from("performance_snapshots")
      .select("period_label, professional_name, services_count, comandas_count, revenue_cents, top_service, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (snaps.error) return { content: [{ type: "text", text: snaps.error.message }], isError: true };
    const mine = (snaps.data ?? []).filter((r) => normalize(r.professional_name) === normalize(nome)).slice(0, limit ?? 6);
    return {
      content: [{ type: "text", text: JSON.stringify({ nome, snapshots: mine }, null, 2) }],
      structuredContent: { nome, snapshots: mine },
    };
  },
});
