/**
 * SystemStore com a service_role do Supabase (ignora RLS).
 * Usado SOMENTE onde não há token do usuário: conclusão do OAuth (gravar o token
 * criptografado), registro de push e agendador. Toda consulta filtra por user_id.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GoogleService } from "@jarvis/shared";
import { check, TASK_COLUMNS, toTask } from "./supabase-store";
import type { IntegrationSecret, SystemStore } from "./types";

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
}
