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
  name: "submit_idea",
  title: "Enviar ideia",
  description: "Envia uma nova sugestão para a Caixa de Ideias em nome do usuário autenticado.",
  inputSchema: {
    title: z.string().trim().min(3).max(120).describe("Título curto da ideia."),
    description: z.string().trim().min(5).max(2000).describe("Descrição detalhada."),
    category: z.string().trim().max(60).optional().describe("Categoria opcional (ex: atendimento, produtos)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ title, description, category }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const { data, error } = await db(ctx)
      .from("ideas")
      .insert({
        author_id: ctx.getUserId()!,
        title,
        description,
        category: category ?? "geral",
      })
      .select("id, title, description, category, status, created_at")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Ideia registrada (id: ${data.id}).` }],
      structuredContent: { idea: data },
    };
  },
});
