import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function db(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_my_ideas",
  title: "Minhas ideias",
  description: "Lista as sugestões que o usuário autenticado enviou para a Caixa de Ideias.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const supabase = db(ctx);
    const { data, error } = await supabase
      .from("ideas")
      .select("id, title, description, category, status, created_at")
      .eq("author_id", ctx.getUserId()!)
      .order("created_at", { ascending: false });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const { data: replyRows } = await supabase.rpc("get_idea_replies");
    const replyMap: Record<string, string> = {};
    (replyRows ?? []).forEach((r: any) => (replyMap[r.idea_id] = r.manager_reply));
    const ideas = (data ?? []).map((i: any) => ({ ...i, manager_reply: replyMap[i.id] ?? null }));
    return {
      content: [{ type: "text", text: JSON.stringify(ideas, null, 2) }],
      structuredContent: { ideas },
    };
  },
});
