/**
 * Ferramentas reais da Fase 1: data/hora e memória persistente.
 * Integrações (agenda, e-mail, negócios) entram nas próximas fases.
 */
import { z } from "zod";
import { MEMORY_CATEGORIES, MemoryCategorySchema, SPACES, SpaceSchema } from "@jarvis/shared";
import { detectSensitive } from "../security/sensitive";
import { wrapUntrusted } from "../security/untrusted";
import { defineTool, ToolRegistry, type ToolContext } from "./registry";
import { PRODUCTIVITY_TOOLS } from "./productivity";
import { DEVICE_TOOLS } from "./device";
import { BUSINESS_TOOLS } from "./business";

export function formatDateTime(now: Date, timezone: string): { text: string; iso: string; weekday: string } {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, weekday: "long" }).format(now);
  // ISO local (sem o "Z"), útil para o modelo calcular "amanhã às 15h".
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { text: fmt.format(now), iso: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`, weekday };
}

const memoryDisabled = () => ({
  content: "O armazenamento de memória está DESATIVADO pelo usuário nas configurações. Nada foi salvo. Informe isso ao usuário.",
  summary: "Memória desativada — nada foi salvo",
  isError: true,
});

function preview(text: string, max = 80) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export const dateTimeTool = defineTool({
  name: "obter_data_hora",
  label: "Data e hora",
  description: "Retorna a data e a hora atuais no fuso horário do usuário. Use para interpretar 'hoje', 'amanhã', dias da semana etc.",
  input: z.object({}),
  risk: "read",
  async execute(_input, ctx) {
    const d = formatDateTime(ctx.now, ctx.profile.timezone);
    return {
      content: JSON.stringify({ agora: d.text, iso_local: d.iso, dia_da_semana: d.weekday, fuso: ctx.profile.timezone }),
      summary: `Consultou a hora: ${d.text}`,
    };
  },
});

export const saveMemoryTool = defineTool({
  name: "salvar_memoria",
  label: "Memória salva",
  description:
    "Salva uma informação duradoura na memória do usuário. Use quando o usuário pedir para lembrar algo, " +
    "ou registrar uma decisão, preferência ou fato profissional importante. Escreva o conteúdo de forma " +
    "autossuficiente (com nomes e datas). Nunca salve senhas, documentos, dados bancários ou de saúde.",
  input: z.object({
    content: z.string().min(2).max(2000).describe("Fato a lembrar, em uma ou duas frases completas."),
    category: MemoryCategorySchema.describe(`Uma de: ${MEMORY_CATEGORIES.join(", ")}`),
    space: SpaceSchema.default("pessoal").describe(`Espaço a que pertence: ${SPACES.join(", ")}`),
  }),
  risk: "write",
  async execute(input, ctx) {
    if (!ctx.profile.memoryEnabled) return memoryDisabled();
    const sensitive = detectSensitive(input.content);
    if (sensitive) {
      await ctx.store.logAction({ tool: "salvar_memoria", status: "blocked", summary: `Bloqueado: possível ${sensitive}` });
      return {
        content: `BLOQUEADO: o conteúdo parece conter ${sensitive}. Por segurança, isso não é armazenado. Nada foi salvo.`,
        summary: `Não salvo: parece conter ${sensitive}`,
        isError: true,
      };
    }
    const m = await ctx.store.createMemory({ ...input, source: "assistant" });
    return { content: JSON.stringify({ salvo: true, id: m.id }), summary: `Memória salva: "${preview(m.content)}"` };
  },
});

export const searchMemoryTool = defineTool({
  name: "buscar_memoria",
  label: "Consulta à memória",
  description:
    "Busca na memória persistente do usuário (decisões, preferências, projetos, compromissos). " +
    "Use antes de responder perguntas sobre o passado. Se nada for encontrado, diga que não há registro.",
  input: z.object({
    query: z.string().max(200).optional().describe("Palavras-chave da busca."),
    category: MemoryCategorySchema.optional(),
    space: SpaceSchema.optional(),
    limit: z.number().int().min(1).max(20).default(8),
  }),
  risk: "read",
  async execute(input, ctx) {
    const items = await ctx.store.listMemories(input);
    if (items.length === 0) {
      return { content: "Nenhuma memória encontrada para esta busca.", summary: "Nenhum registro encontrado na memória" };
    }
    const lines = items.map((m) => `- [id=${m.id}] (${m.category}, ${m.space}, atualizado ${m.updatedAt.slice(0, 10)}) ${m.content}`);
    return {
      content: wrapUntrusted("memoria_do_usuario", lines.join("\n")),
      summary: `${items.length} registro(s) encontrado(s) na memória`,
    };
  },
});

export const updateMemoryTool = defineTool({
  name: "corrigir_memoria",
  label: "Memória corrigida",
  description: "Corrige uma memória existente (use o id retornado por buscar_memoria) quando o usuário informar que algo mudou ou estava errado.",
  input: z.object({
    id: z.string().uuid(),
    content: z.string().min(2).max(2000).optional(),
    category: MemoryCategorySchema.optional(),
    space: SpaceSchema.optional(),
  }),
  risk: "write",
  async execute(input, ctx) {
    if (!ctx.profile.memoryEnabled) return memoryDisabled();
    if (input.content) {
      const sensitive = detectSensitive(input.content);
      if (sensitive) return { content: `BLOQUEADO: parece conter ${sensitive}. Nada foi alterado.`, summary: `Não alterado: ${sensitive}`, isError: true };
    }
    const { id, ...patch } = input;
    const m = await ctx.store.updateMemory(id, patch);
    if (!m) return { content: "Memória não encontrada. Nada foi alterado.", summary: "Memória não encontrada", isError: true };
    return { content: JSON.stringify({ atualizado: true, id: m.id }), summary: `Memória corrigida: "${preview(m.content)}"` };
  },
});

export const deleteMemoryTool = defineTool({
  name: "apagar_memoria",
  label: "Apagar memória",
  description:
    "Solicita a exclusão de uma memória (use o id de buscar_memoria). A exclusão NÃO acontece imediatamente: " +
    "o usuário precisa confirmar no aplicativo.",
  input: z.object({ id: z.string().uuid() }),
  risk: "confirm",
  async describe(input, ctx: ToolContext) {
    const m = await ctx.store.getMemory(input.id);
    return m ? `Apagar a memória: "${preview(m.content, 120)}"` : `Apagar a memória ${input.id}`;
  },
  async execute(input, ctx) {
    const ok = await ctx.store.deleteMemory(input.id);
    return ok
      ? { content: "Memória apagada.", summary: "Memória apagada" }
      : { content: "Memória não encontrada; nada foi apagado.", summary: "Memória não encontrada", isError: true };
  },
});

export function createDefaultRegistry(): ToolRegistry {
  return new ToolRegistry().register(dateTimeTool, saveMemoryTool, searchMemoryTool, updateMemoryTool, deleteMemoryTool, ...PRODUCTIVITY_TOOLS, ...DEVICE_TOOLS, ...BUSINESS_TOOLS);
}
