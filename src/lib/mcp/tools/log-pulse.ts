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
  name: "log_pulse",
  title: "Registrar humor do dia",
  description: "Registra ou atualiza o pulso (humor) do usuário para o dia de hoje.",
  inputSchema: {
    mood: z.enum(["otimo", "bom", "ok", "cansado", "ruim"]).describe("Humor de hoje."),
  },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ mood }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const supabase = db(ctx);
    const uid = ctx.getUserId()!;
    const today = new Date().toISOString().slice(0, 10);
    const existing = await supabase
      .from("pulses")
      .select("id")
      .eq("user_id", uid)
      .eq("day", today)
      .maybeSingle();
    const op = existing.data
      ? await supabase.from("pulses").update({ mood }).eq("id", existing.data.id).select().single()
      : await supabase.from("pulses").insert({ user_id: uid, day: today, mood }).select().single();
    if (op.error) return { content: [{ type: "text", text: op.error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Pulso do dia salvo: ${mood}` }],
      structuredContent: { pulse: op.data },
    };
  },
});
