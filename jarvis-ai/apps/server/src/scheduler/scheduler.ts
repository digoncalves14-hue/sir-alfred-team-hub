/**
 * Agendador (Automation Engine — Fase 2):
 *  - Lembretes de tarefas no horário marcado.
 *  - Resumo diário no horário escolhido pelo usuário.
 *  - Lembrete N minutos antes de reuniões do Google Agenda.
 *
 * Roda no backend (não depende do app aberto). Cada envio é deduplicado no banco,
 * então pode rodar em mais de uma instância ou via cron externo sem duplicar avisos.
 */
import { buildDay, summaryText } from "../agent/summary";
import { humanDateTime, toLocalIso } from "../agent/time";
import type { GoogleGateway } from "../google/gateway";
import type { PushSender } from "../push/expo";
import type { SystemStore } from "../store/types";

export interface TickReport {
  reminders: number;
  summaries: number;
  meetingReminders: number;
  errors: number;
}

export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(
    private readonly deps: {
      system: SystemStore;
      push: PushSender;
      google: GoogleGateway | null;
      clock?: () => Date;
      log?: { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void };
    },
  ) {}

  start(intervalMs = 60_000) {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
  }

  /** true quando o laço interno (setInterval) está ativo. */
  get active(): boolean {
    return this.timer !== null;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<TickReport> {
    const report: TickReport = { reminders: 0, summaries: 0, meetingReminders: 0, errors: 0 };
    if (this.busy) return report; // evita execuções sobrepostas
    this.busy = true;
    const now = this.deps.clock?.() ?? new Date();
    try {
      await this.reminders(now, report);
      const candidates = await this.deps.system.listSummaryCandidates();
      for (const c of candidates) {
        try {
          await this.dailySummary(c, now, report);
        } catch (e) {
          report.errors++;
          this.deps.log?.warn({ err: String(e) }, "falha no resumo diário");
        }
      }
      await this.meetingReminders(candidates, now, report);
    } catch (e) {
      report.errors++;
      this.deps.log?.warn({ err: String(e) }, "falha no agendador");
    } finally {
      this.busy = false;
    }
    if (report.reminders + report.summaries + report.meetingReminders + report.errors > 0) this.deps.log?.info({ ...report }, "agendador");
    return report;
  }

  private async notify(userId: string, kind: "resumo_diario" | "lembrete_tarefa" | "lembrete_reuniao", title: string, body: string, dedupeKey: string, url: string) {
    const id = await this.deps.system.insertNotification({ userId, kind, title, body, dedupeKey });
    if (!id) return false; // já enviado antes
    const r = await this.deps.push.send(userId, { title, body, url });
    if (r.sent > 0) await this.deps.system.markNotificationDelivered(id);
    return true;
  }

  private async reminders(now: Date, report: TickReport) {
    const due = await this.deps.system.claimDueReminders(now, 100);
    for (const { userId, task } of due) {
      const sent = await this.notify(userId, "lembrete_tarefa", "Lembrete", task.title, `tarefa:${task.id}:${task.remindAt}`, "jarvis://dashboard");
      if (sent) report.reminders++;
    }
  }

  private async dailySummary(c: Awaited<ReturnType<SystemStore["listSummaryCandidates"]>>[number], now: Date, report: TickReport) {
    if (!c.dailySummaryEnabled) return;
    const local = toLocalIso(now, c.timezone);
    const today = local.slice(0, 10);
    if (local.slice(11) < c.dailySummaryTime) return; // ainda não é a hora
    if (c.lastSummaryDate && c.lastSummaryDate >= today) return;
    // Não envia resumo "atrasado" demais (ex.: servidor ficou desligado o dia todo).
    const [h, m] = c.dailySummaryTime.split(":").map(Number) as [number, number];
    const [lh, lm] = local.slice(11).split(":").map(Number) as [number, number];
    if (lh * 60 + lm - (h * 60 + m) > 180) return;
    if (!(await this.deps.system.claimDailySummary(c.userId, today))) return;

    const tasks = await this.deps.system.openTasksForUser(c.userId, today);
    const day = await buildDay(this.deps.google?.forUser(c.userId) ?? null, tasks, today, c.timezone);
    const body = summaryText(day, c.ownerName, c.timezone, lh < 12 ? "Bom dia" : lh < 18 ? "Boa tarde" : "Boa noite");
    if (await this.notify(c.userId, "resumo_diario", "Resumo do dia", body, `resumo:${today}`, "jarvis://dashboard")) report.summaries++;
  }

  private async meetingReminders(candidates: Awaited<ReturnType<SystemStore["listSummaryCandidates"]>>, now: Date, report: TickReport) {
    if (!this.deps.google) return;
    const users = new Set(await this.deps.system.listIntegratedUsers("google", "calendar"));
    for (const c of candidates) {
      if (!users.has(c.userId) || c.meetingReminderMinutes <= 0) continue;
      try {
        const cal = await this.deps.google.forUser(c.userId).calendar();
        const windowEnd = new Date(now.getTime() + c.meetingReminderMinutes * 60_000);
        const events = await cal.list(now, windowEnd, c.timezone, 10);
        for (const e of events) {
          if (e.allDay || !e.busy || e.startAt < now || e.startAt > windowEnd) continue;
          const mins = Math.max(1, Math.round((e.startAt.getTime() - now.getTime()) / 60_000));
          const body = `${e.title} às ${humanDateTime(e.startAt, c.timezone, false)} (em ${mins} min)${e.location ? ` — ${e.location}` : ""}`;
          const key = `reuniao:${e.id}:${e.startAt.toISOString()}`;
          if (await this.notify(c.userId, "lembrete_reuniao", "Reunião em breve", body, key, "jarvis://dashboard")) report.meetingReminders++;
        }
      } catch (e) {
        report.errors++;
        this.deps.log?.warn({ err: String(e), user: c.userId.slice(0, 8) }, "falha no lembrete de reunião");
      }
    }
  }
}

