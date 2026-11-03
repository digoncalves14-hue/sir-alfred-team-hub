/**
 * Relatórios e automações (Fase 4) — gerados de forma DETERMINÍSTICA a partir de
 * dados reais (conectores e tarefas). Sem custo de IA. O usuário escolhe quais
 * automações ficam ligadas, o dia e o horário.
 */
import { SPACE_LABELS, type AutomationKind, type ConnectorMetrics, type Kpi, type Report, type Space, type Task } from "@jarvis/shared";
import { localDate, toLocalIso } from "../agent/time";
import type { DueAutomation, SystemStore } from "../store/types";
import type { ConnectorService } from "./connectors";
import { brl } from "./metrics";

export function formatKpi(k: Kpi): string {
  if (k.unit === "text") return `${k.label}: ${k.text ?? "—"}`;
  if (k.value === null) return `${k.label}: ${k.text ?? "—"}`;
  const v = k.unit === "brl" ? brl(k.value) : k.unit === "pct" ? `${k.value}%` : k.unit === "stars" ? `${k.value.toFixed(1)}★` : k.value.toLocaleString("pt-BR");
  const change = k.changePct !== undefined && k.changePct !== null ? ` (${k.changePct > 0 ? "+" : ""}${k.changePct.toLocaleString("pt-BR")}% vs anterior)` : "";
  return `${k.label}: ${v}${change}${k.text && k.unit !== "stars" ? ` — ${k.text}` : k.unit === "stars" && k.text ? ` — ${k.text}` : ""}`;
}

export function metricsSection(m: ConnectorMetrics): string {
  const lines = [`${m.connectorName}${m.period ? ` — ${m.period}` : ""}`];
  if (m.error) return `${lines[0]}\n  ⚠ ${m.error}`;
  lines.push(...m.kpis.map((k) => `  • ${formatKpi(k)}`));
  if (m.highlights.length) lines.push(`  Destaques: ${m.highlights.join("; ")}`);
  if (m.alerts.length) lines.push(`  Atenção: ${m.alerts.join("; ")}`);
  return lines.join("\n");
}

/** Chave do período: semana ISO para automações semanais, data para diárias. */
export function runKey(now: Date, timezone: string, weekly: boolean): string {
  const date = localDate(now, timezone);
  if (!weekly) return date;
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // segunda = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // quinta da semana
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** A automação deve rodar agora? (dia da semana certo, horário atingido, até 3 h de atraso). */
export function isDue(a: Pick<DueAutomation, "weekday" | "runTime" | "timezone">, now: Date): boolean {
  const local = toLocalIso(now, a.timezone);
  const weekday = new Date(`${local.slice(0, 10)}T00:00:00Z`).getUTCDay();
  if (a.weekday !== null && a.weekday !== weekday) return false;
  const [h, m] = a.runTime.split(":").map(Number) as [number, number];
  const [lh, lm] = local.slice(11).split(":").map(Number) as [number, number];
  const diff = lh * 60 + lm - (h * 60 + m);
  return diff >= 0 && diff <= 180;
}

export interface GeneratedReport {
  title: string;
  body: string;
  /** Texto curto para a notificação. */
  notification: string;
  /** false = nada a reportar (alertas só notificam quando há algo). */
  worthNotifying: boolean;
  data: unknown;
}

export class ReportGenerator {
  constructor(
    private readonly deps: { system: SystemStore; connectors: ConnectorService | null; clock?: () => Date },
  ) {}

  private now() {
    return this.deps.clock?.() ?? new Date();
  }

  async generate(kind: AutomationKind, userId: string, space: Space | null, timezone: string): Promise<GeneratedReport> {
    const today = localDate(this.now(), timezone);
    const scope = space ? SPACE_LABELS[space] : "todos os negócios";
    switch (kind) {
      case "relatorio_negocios": {
        if (!this.deps.connectors) {
          return { title: `Relatório — ${scope}`, body: "Conectores não configurados no servidor.", notification: "Conectores não configurados.", worthNotifying: false, data: {} };
        }
        const { metrics } = await this.deps.connectors.spaceMetrics(userId, space ?? undefined, timezone, true);
        const tasks = await this.deps.system.openTasksForUser(userId, "9999-12-31");
        const scoped = space ? tasks.filter((t) => t.space === space) : tasks;
        const overdue = scoped.filter((t) => t.dueDate && t.dueDate < today);
        const sections = metrics.length ? metrics.map(metricsSection) : ["Nenhuma fonte de dados conectada. Conecte o Hub ou uma planilha na aba Negócios."];
        const body = [
          `Relatório de ${scope} — ${today}`,
          "",
          ...sections,
          "",
          `Tarefas abertas: ${scoped.length}${overdue.length ? ` (${overdue.length} atrasadas)` : ""}`,
        ].join("\n");
        const first = metrics.find((m) => !m.error && m.kpis[0]);
        const headline = first ? `${first.connectorName}: ${formatKpi(first.kpis[0]!)}` : "Sem dados de conectores";
        return { title: `Relatório semanal — ${scope}`, body, notification: `${headline}. Tarefas abertas: ${scoped.length}.`, worthNotifying: true, data: { metrics } };
      }
      case "pendencias": {
        const tasks = await this.deps.system.openTasksForUser(userId, "9999-12-31");
        const scoped = space ? tasks.filter((t) => t.space === space) : tasks;
        const groups = new Map<Space, Task[]>();
        for (const t of scoped) groups.set(t.space, [...(groups.get(t.space) ?? []), t]);
        const overdue = scoped.filter((t) => t.dueDate && t.dueDate < today);
        const body = [
          `Pendências — ${scope} — ${today}`,
          `Total: ${scoped.length} abertas, ${overdue.length} atrasadas.`,
          ...[...groups.entries()].map(
            ([s, list]) =>
              `\n${SPACE_LABELS[s]} (${list.length})\n${list
                .slice(0, 15)
                .map((t) => `  • ${t.title}${t.dueDate ? ` — prazo ${t.dueDate}${t.dueDate < today ? " (ATRASADA)" : ""}` : ""}${t.priority === "alta" ? " [alta]" : ""}`)
                .join("\n")}`,
          ),
        ].join("\n");
        return {
          title: `Pendências da semana — ${scope}`,
          body,
          notification: `${scoped.length} tarefa(s) aberta(s), ${overdue.length} atrasada(s).`,
          worthNotifying: true,
          data: { open: scoped.length, overdue: overdue.length },
        };
      }
      case "tarefas_atrasadas": {
        const tasks = await this.deps.system.openTasksForUser(userId, today);
        const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today && (!space || t.space === space));
        const body = overdue.length
          ? [`Tarefas atrasadas — ${today}`, ...overdue.map((t) => `• ${t.title} — prazo ${t.dueDate} (${SPACE_LABELS[t.space]})`)].join("\n")
          : "Nenhuma tarefa atrasada.";
        return {
          title: "Tarefas atrasadas",
          body,
          notification: overdue.length ? `${overdue.length} tarefa(s) atrasada(s): ${overdue.slice(0, 2).map((t) => t.title).join("; ")}` : "Nenhuma tarefa atrasada.",
          worthNotifying: overdue.length > 0,
          data: { overdue: overdue.length },
        };
      }
      case "alerta_estoque": {
        if (!this.deps.connectors) return { title: "Estoque", body: "Conectores não configurados.", notification: "", worthNotifying: false, data: {} };
        const connectors = (await this.deps.system.listConnectorsFor(userId, space ?? undefined)).filter(
          (c) => c.type === "google_sheets" && (c.config as { dataset?: string }).dataset === "estoque",
        );
        const metrics = await Promise.all(connectors.map((c) => this.deps.connectors!.metrics(c, timezone, true)));
        const alerts = metrics.flatMap((m) => m.alerts.map((a) => `${m.connectorName}: ${a}`));
        const errors = metrics.filter((m) => m.error).map((m) => `${m.connectorName}: ${m.error}`);
        const body = connectors.length
          ? [`Estoque — ${today}`, ...(alerts.length ? alerts.map((a) => `• ${a}`) : ["Nenhum item abaixo do mínimo."]), ...errors.map((e) => `⚠ ${e}`)].join("\n")
          : "Nenhuma planilha de estoque conectada.";
        return {
          title: "Alerta de estoque",
          body,
          notification: alerts.length ? `${alerts.length} item(ns) com estoque baixo: ${alerts.slice(0, 2).join("; ")}` : "Estoque ok.",
          worthNotifying: alerts.length > 0,
          data: { alerts },
        };
      }
    }
  }

  /** Gera e salva o relatório (usado por "executar agora" e pelo agendador). */
  async run(kind: AutomationKind, userId: string, space: Space | null, timezone: string): Promise<{ report: Report; generated: GeneratedReport }> {
    const generated = await this.generate(kind, userId, space, timezone);
    const report = await this.deps.system.insertReport({ userId, space, kind, title: generated.title, body: generated.body, data: generated.data });
    return { report, generated };
  }
}
