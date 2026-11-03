/**
 * SystemStore com a service_role do Supabase (ignora RLS).
 * Usado SOMENTE onde não há token do usuário: conclusão do OAuth (gravar o token
 * criptografado), registro de push e agendador. Toda consulta filtra por user_id.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GoogleService, MemoryCategory, Space } from "@jarvis/shared";
import { AUTOMATION_COLUMNS, ROUTINE_COLUMNS, toRoutine, check, CONNECTOR_COLUMNS, REPORT_COLUMNS, TASK_COLUMNS, toAutomation, toConnector, toMemoryRow, toProfileRow, toReport, toTask } from "./supabase-store";
import type { ConnectorRecord, DueAutomation, IntegrationSecret, ScheduledRoutine, SystemStore, TaskInput } from "./types";

type Row = Record<string, unknown>;

export function createServiceClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export class SupabaseSystemStore implements SystemStore {
  constructor(private readonly sb: SupabaseClient) {}

  async upsertIntegration(input: Parameters<SystemStore["upsertIntegration"]>[0]) {
    check(
      await this.sb.from("jarvis_integrations").upsert(
        {
          user_id: input.userId,
          provider: input.provider,
          account_email: input.accountEmail,
          scopes: input.scopes,
          services: input.services,
          encrypted_refresh_token: input.encryptedRefreshToken,
          status: "active",
          last_error: null,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider" },
      ),
      "integração",
    );
  }

  async getIntegrationSecret(userId: string, provider: "google"): Promise<IntegrationSecret | null> {
    const r = check(
      await this.sb.from("jarvis_integrations").select("*").eq("user_id", userId).eq("provider", provider).maybeSingle(),
      "integração",
    ) as Row | null;
    if (!r) return null;
    return {
      accountEmail: (r.account_email as string | null) ?? null,
      scopes: (r.scopes as string[]) ?? [],
      services: (r.services as GoogleService[]) ?? [],
      status: r.status as IntegrationSecret["status"],
      lastError: (r.last_error as string | null) ?? null,
      connectedAt: String(r.connected_at),
      encryptedRefreshToken: String(r.encrypted_refresh_token),
    };
  }

  async setIntegrationStatus(userId: string, provider: "google", status: "active" | "error" | "revoked", lastError: string | null) {
    check(
      await this.sb.from("jarvis_integrations").update({ status, last_error: lastError?.slice(0, 300) ?? null }).eq("user_id", userId).eq("provider", provider),
      "integração",
    );
  }

  async deleteIntegration(userId: string, provider: "google") {
    check(await this.sb.from("jarvis_integrations").delete().eq("user_id", userId).eq("provider", provider), "integração");
  }

  async listIntegratedUsers(provider: "google", service: GoogleService) {
    const rows = check(
      await this.sb.from("jarvis_integrations").select("user_id").eq("provider", provider).eq("status", "active").contains("services", [service]),
      "integrações",
    );
    return ((rows ?? []) as Row[]).map((r) => String(r.user_id));
  }

  async upsertPushToken(userId: string, token: string, deviceName?: string) {
    check(
      await this.sb
        .from("jarvis_push_tokens")
        .upsert({ token, user_id: userId, device_name: deviceName ?? null, last_seen_at: new Date().toISOString() }, { onConflict: "token" }),
      "token de push",
    );
  }
  async deletePushToken(token: string) {
    check(await this.sb.from("jarvis_push_tokens").delete().eq("token", token), "token de push");
  }
  async deleteUserPushToken(userId: string, token: string) {
    const rows = check(await this.sb.from("jarvis_push_tokens").delete().eq("token", token).eq("user_id", userId).select("token"), "token de push");
    return (rows ?? []).length > 0;
  }
  async listPushTokens(userId: string) {
    const rows = check(await this.sb.from("jarvis_push_tokens").select("token").eq("user_id", userId), "tokens de push");
    return ((rows ?? []) as Row[]).map((r) => String(r.token));
  }

  async claimDueReminders(now: Date, limit: number) {
    const candidates = check(
      await this.sb
        .from("jarvis_tasks")
        .select("id")
        .eq("status", "aberta")
        .is("reminded_at", null)
        .not("remind_at", "is", null)
        .lte("remind_at", now.toISOString())
        .limit(limit),
      "lembretes",
    ) as Row[] | null;
    const ids = (candidates ?? []).map((r) => String(r.id));
    if (ids.length === 0) return [];
    // A condição "reminded_at is null" no UPDATE garante que cada lembrete é reivindicado uma única vez.
    const claimed = check(
      await this.sb
        .from("jarvis_tasks")
        .update({ reminded_at: now.toISOString() })
        .in("id", ids)
        .is("reminded_at", null)
        .select(`user_id, ${TASK_COLUMNS}`),
      "lembretes",
    ) as Row[] | null;
    return (claimed ?? []).map((r) => ({ userId: String(r.user_id), task: toTask(r) }));
  }

  async listSummaryCandidates() {
    const rows = check(
      await this.sb
        .from("jarvis_profiles")
        .select("user_id, owner_name, timezone, daily_summary_enabled, daily_summary_time, meeting_reminder_minutes, last_summary_date")
        .limit(1000),
      "perfis",
    ) as Row[] | null;
    return (rows ?? []).map((r) => ({
      userId: String(r.user_id),
      ownerName: String(r.owner_name),
      timezone: String(r.timezone),
      dailySummaryEnabled: Boolean(r.daily_summary_enabled),
      dailySummaryTime: String(r.daily_summary_time),
      meetingReminderMinutes: Number(r.meeting_reminder_minutes),
      lastSummaryDate: (r.last_summary_date as string | null) ?? null,
    }));
  }

  async claimDailySummary(userId: string, localDate: string) {
    const rows = check(
      await this.sb
        .from("jarvis_profiles")
        .update({ last_summary_date: localDate })
        .eq("user_id", userId)
        .or(`last_summary_date.is.null,last_summary_date.lt.${localDate}`)
        .select("user_id"),
      "perfil",
    );
    return (rows ?? []).length > 0;
  }

  async openTasksForUser(userId: string, dueOnOrBefore: string) {
    const rows = check(
      await this.sb
        .from("jarvis_tasks")
        .select(TASK_COLUMNS)
        .eq("user_id", userId)
        .eq("status", "aberta")
        .or(`due_date.is.null,due_date.lte.${dueOnOrBefore}`)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(50),
      "tarefas",
    ) as Row[] | null;
    return (rows ?? []).map(toTask);
  }

  async insertNotification(input: Parameters<SystemStore["insertNotification"]>[0]) {
    const rows = check(
      await this.sb
        .from("jarvis_notifications")
        .upsert(
          { user_id: input.userId, kind: input.kind, title: input.title, body: input.body, dedupe_key: input.dedupeKey },
          { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
        )
        .select("id"),
      "notificação",
    ) as Row[] | null;
    return rows && rows.length > 0 ? String(rows[0]!.id) : null;
  }

  async markNotificationDelivered(id: string) {
    check(await this.sb.from("jarvis_notifications").update({ delivered: true }).eq("id", id), "notificação");
  }

  // ---- Fase 3 ----
  async createDeviceToken(userId: string, tokenHash: string, name: string) {
    const r = check(
      await this.sb.from("jarvis_device_tokens").insert({ user_id: userId, token_hash: tokenHash, name }).select("id").single(),
      "token do aparelho",
    ) as Row;
    return String(r.id);
  }

  async resolveDeviceToken(tokenHash: string) {
    const rows = check(
      await this.sb
        .from("jarvis_device_tokens")
        .update({ last_used_at: new Date().toISOString() })
        .eq("token_hash", tokenHash)
        .is("revoked_at", null)
        .select("user_id"),
      "token do aparelho",
    ) as Row[] | null;
    return rows && rows.length > 0 ? String(rows[0]!.user_id) : null;
  }

  async getProfileFor(userId: string) {
    const found = check(await this.sb.from("jarvis_profiles").select("*").eq("user_id", userId).maybeSingle(), "perfil") as Row | null;
    if (found) return toProfileRow(found);
    const created = check(
      await this.sb.from("jarvis_profiles").upsert({ user_id: userId }, { onConflict: "user_id" }).select("*").single(),
      "perfil",
    ) as Row;
    return toProfileRow(created);
  }

  async createTaskFor(userId: string, input: TaskInput) {
    const r = check(
      await this.sb
        .from("jarvis_tasks")
        .insert({
          user_id: userId,
          title: input.title,
          notes: input.notes ?? null,
          space: input.space,
          priority: input.priority,
          due_date: input.dueDate ?? null,
          remind_at: input.remindAt ?? null,
        })
        .select(TASK_COLUMNS)
        .single(),
      "tarefa",
    ) as Row;
    return toTask(r);
  }

  async createMemoryFor(userId: string, input: { category: MemoryCategory; space: Space; content: string }) {
    const r = check(
      await this.sb
        .from("jarvis_memories")
        .insert({ user_id: userId, ...input, source: "user" })
        .select("id, category, space, content, source, created_at, updated_at")
        .single(),
      "memória",
    ) as Row;
    return toMemoryRow(r);
  }

  async logActionFor(userId: string, entry: { tool: string; status: "executed" | "failed" | "blocked"; summary: string }) {
    check(
      await this.sb.from("jarvis_action_log").insert({ user_id: userId, tool_name: entry.tool, status: entry.status, summary: entry.summary.slice(0, 500) }),
      "registro de ações",
    );
  }

  // ---- Fase 4 ----
  private toRecord(r: Row): ConnectorRecord {
    return { ...toConnector(r), userId: String(r.user_id), encryptedSecret: (r.encrypted_secret as string | null) ?? null };
  }

  async createConnector(input: Parameters<SystemStore["createConnector"]>[0]) {
    if (input.type === "sir_alfred_hub") {
      // Um único Hub por usuário: reconectar substitui o anterior.
      check(await this.sb.from("jarvis_connectors").delete().eq("user_id", input.userId).eq("type", "sir_alfred_hub"), "conector");
    }
    const r = check(
      await this.sb
        .from("jarvis_connectors")
        .insert({
          user_id: input.userId,
          space: input.space,
          type: input.type,
          name: input.name,
          config: input.config,
          encrypted_secret: input.encryptedSecret,
          account_label: input.accountLabel,
        })
        .select(`user_id, encrypted_secret, ${CONNECTOR_COLUMNS}`)
        .single(),
      "conector",
    ) as Row;
    return this.toRecord(r);
  }

  async getConnector(userId: string, id: string) {
    const r = check(
      await this.sb.from("jarvis_connectors").select(`user_id, encrypted_secret, ${CONNECTOR_COLUMNS}`).eq("user_id", userId).eq("id", id).maybeSingle(),
      "conector",
    ) as Row | null;
    return r ? this.toRecord(r) : null;
  }

  async listConnectorsFor(userId: string, space?: Space) {
    let q = this.sb.from("jarvis_connectors").select(`user_id, encrypted_secret, ${CONNECTOR_COLUMNS}`).eq("user_id", userId);
    if (space) q = q.eq("space", space);
    return ((check(await q.order("created_at", { ascending: true }), "conectores") ?? []) as Row[]).map((r) => this.toRecord(r));
  }

  async updateConnectorSecret(id: string, encryptedSecret: string) {
    check(await this.sb.from("jarvis_connectors").update({ encrypted_secret: encryptedSecret }).eq("id", id), "conector");
  }

  async setConnectorStatus(id: string, status: "active" | "error", lastError: string | null, synced: boolean) {
    check(
      await this.sb
        .from("jarvis_connectors")
        .update({ status, last_error: lastError?.slice(0, 300) ?? null, ...(synced ? { last_sync_at: new Date().toISOString() } : {}) })
        .eq("id", id),
      "conector",
    );
  }

  async insertReport(input: Parameters<SystemStore["insertReport"]>[0]) {
    const r = check(
      await this.sb
        .from("jarvis_reports")
        .insert({ user_id: input.userId, space: input.space, kind: input.kind, title: input.title, body: input.body, data: input.data ?? {} })
        .select(REPORT_COLUMNS)
        .single(),
      "relatório",
    ) as Row;
    return toReport(r);
  }

  async listEnabledAutomations(): Promise<DueAutomation[]> {
    const rows = (check(await this.sb.from("jarvis_automations").select(`user_id, last_run_key, ${AUTOMATION_COLUMNS}`).eq("enabled", true).limit(2000), "automações") ??
      []) as Row[];
    if (rows.length === 0) return [];
    const ids = [...new Set(rows.map((r) => String(r.user_id)))];
    const profiles = (check(await this.sb.from("jarvis_profiles").select("user_id, timezone, owner_name").in("user_id", ids), "perfis") ?? []) as Row[];
    const byUser = new Map(profiles.map((p) => [String(p.user_id), p]));
    return rows.map((r) => ({
      ...toAutomation(r),
      userId: String(r.user_id),
      lastRunKey: (r.last_run_key as string | null) ?? null,
      timezone: String(byUser.get(String(r.user_id))?.timezone ?? "America/Sao_Paulo"),
      ownerName: String(byUser.get(String(r.user_id))?.owner_name ?? "senhor"),
    }));
  }

  async claimAutomationRun(id: string, runKey: string) {
    const rows = check(
      await this.sb
        .from("jarvis_automations")
        .update({ last_run_key: runKey, last_run_at: new Date().toISOString() })
        .eq("id", id)
        .or(`last_run_key.is.null,last_run_key.neq.${runKey}`)
        .select("id"),
      "automação",
    );
    return (rows ?? []).length > 0;
  }

  // ---- Fase 5 ----
  async listScheduledRoutines(): Promise<ScheduledRoutine[]> {
    const rows = (check(
      await this.sb
        .from("jarvis_routines")
        .select(`user_id, last_run_key, ${ROUTINE_COLUMNS}`)
        .eq("enabled", true)
        .eq("schedule_enabled", true)
        .not("run_time", "is", null)
        .limit(2000),
      "rotinas",
    ) ?? []) as Row[];
    if (rows.length === 0) return [];
    const ids = [...new Set(rows.map((r) => String(r.user_id)))];
    const profiles = (check(await this.sb.from("jarvis_profiles").select("user_id, timezone").in("user_id", ids), "perfis") ?? []) as Row[];
    const tz = new Map(profiles.map((p) => [String(p.user_id), String(p.timezone)]));
    return rows.map((r) => ({
      ...toRoutine(r),
      userId: String(r.user_id),
      lastRunKey: (r.last_run_key as string | null) ?? null,
      timezone: tz.get(String(r.user_id)) ?? "America/Sao_Paulo",
    }));
  }

  async claimRoutineRun(id: string, runKey: string) {
    const rows = check(
      await this.sb
        .from("jarvis_routines")
        .update({ last_run_key: runKey, last_run_at: new Date().toISOString() })
        .eq("id", id)
        .or(`last_run_key.is.null,last_run_key.neq.${runKey}`)
        .select("id"),
      "rotina",
    );
    return (rows ?? []).length > 0;
  }
}
