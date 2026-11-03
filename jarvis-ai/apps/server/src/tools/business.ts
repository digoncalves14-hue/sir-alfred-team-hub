/**
 * Ferramentas da Fase 4 — dados REAIS dos negócios via conectores autorizados.
 * Sem conector, o Jarvis diz que não há dados (nunca estima vendas ou estoque).
 */
import { z } from "zod";
import { AutomationKindSchema, SPACE_LABELS, SpaceSchema } from "@jarvis/shared";
import { metricsSection } from "../business/reports";
import { IntegrationError } from "../google/errors";
import { wrapUntrusted } from "../security/untrusted";
import { defineTool, type ToolContext } from "./registry";

function requireBusiness(ctx: ToolContext) {
  if (!ctx.business) throw new IntegrationError("nao_configurado", "Os conectores de negócios não estão configurados no servidor.");
  return ctx.business;
}

const notConfigured = (e: unknown) =>
  e instanceof IntegrationError ? { content: `NÃO EXECUTADO: ${e.message}`, summary: e.message, isError: true } : null;

export const businessIndicatorsTool = defineTool({
  name: "negocio_indicadores",
  label: "Indicadores do negócio",
  description:
    "Consulta indicadores REAIS dos negócios a partir das fontes conectadas (Sir Alfred Team Hub, planilhas): faturamento, " +
    "serviços, ticket médio, ranking da equipe, vendas, estoque, pedidos, cronogramas, metas. Informe o espaço " +
    "(sir_alfred, black_bear, barton, alfie_fred, educacao) ou omita para todos. Se não houver fonte conectada, diga isso.",
  input: z.object({ espaco: SpaceSchema.optional(), atualizar: z.boolean().default(false).describe("Ignora o cache de 5 minutos") }),
  risk: "read",
  async execute(input, ctx) {
    try {
      const { connectors } = requireBusiness(ctx);
      const { metrics } = await connectors.spaceMetrics(ctx.store.userId, input.espaco, ctx.profile.timezone, input.atualizar);
      const scope = input.espaco ? SPACE_LABELS[input.espaco] : "todos os espaços";
      if (metrics.length === 0) {
        return {
          content: `Nenhuma fonte de dados conectada para ${scope}. Os dados reais só aparecem após conectar o Sir Alfred Team Hub ou uma planilha (aba Negócios do app).`,
          summary: `Sem fontes conectadas para ${scope}`,
        };
      }
      const text = metrics.map((m) => `[conector_id=${m.connectorId}] ${metricsSection(m)}`).join("\n\n");
      return { content: wrapUntrusted("negocios", text), summary: `Indicadores de ${scope} (${metrics.length} fonte(s))` };
    } catch (e) {
      const r = notConfigured(e);
      if (r) return r;
      throw e;
    }
  },
});

export const businessDataTool = defineTool({
  name: "negocio_dados",
  label: "Dados do negócio",
  description: "Lê as linhas de uma fonte conectada (id de negocio_indicadores) para responder perguntas específicas, ex.: 'quanto vendeu o produto X'.",
  input: z.object({ conector_id: z.string().uuid(), limite: z.number().int().min(1).max(200).default(60) }),
  risk: "read",
  async execute(input, ctx) {
    try {
      const { connectors } = requireBusiness(ctx);
      const conn = await connectors.ownConnector(ctx.store.userId, input.conector_id);
      if (!conn) return { content: "Fonte não encontrada.", summary: "Fonte não encontrada", isError: true };
      const { headers, rows } = await connectors.rows(conn, input.limite);
      const lines = rows.map((r) => headers.map((h) => `${h}=${r[h] ?? ""}`).join(" | "));
      return {
        content: wrapUntrusted(`conector:${conn.name}`, `Colunas: ${headers.join(", ")}\n${lines.join("\n") || "(sem linhas)"}`),
        summary: `${rows.length} linha(s) de "${conn.name}"`,
      };
    } catch (e) {
      const r = notConfigured(e);
      if (r) return r;
      throw e;
    }
  },
});

export const businessReportTool = defineTool({
  name: "negocio_relatorio",
  label: "Relatório gerado",
  description:
    "Gera e salva um relatório: relatorio_negocios (indicadores), pendencias (tarefas abertas), tarefas_atrasadas ou alerta_estoque. " +
    "Fica disponível na aba Negócios. Não envia nada a terceiros.",
  input: z.object({ tipo: AutomationKindSchema, espaco: SpaceSchema.optional() }),
  risk: "write",
  async execute(input, ctx) {
    try {
      const { reports } = requireBusiness(ctx);
      const { report, generated } = await reports.run(input.tipo, ctx.store.userId, input.espaco ?? null, ctx.profile.timezone);
      return { content: wrapUntrusted("relatorio", `${report.title}\n${generated.body}`), summary: `Relatório salvo: ${report.title}` };
    } catch (e) {
      const r = notConfigured(e);
      if (r) return r;
      throw e;
    }
  },
});

export const BUSINESS_TOOLS = [businessIndicatorsTool, businessDataTool, businessReportTool];
