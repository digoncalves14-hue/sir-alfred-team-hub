/**
 * Serviço de conectores empresariais (Fase 4).
 * Drivers: Sir Alfred Team Hub (OAuth) e Google Planilhas (somente leitura).
 * Toda leitura é feita com a autorização do próprio usuário; os resultados ficam
 * em cache curto para não sobrecarregar as APIs.
 */
import type { ConnectorMetrics, SheetDataset, Space } from "@jarvis/shared";
import { SheetDatasetSchema } from "@jarvis/shared";
import { localDate } from "../agent/time";
import type { GoogleGateway } from "../google/gateway";
import { IntegrationError } from "../google/errors";
import { parseSpreadsheetId } from "../google/sheets";
import type { SecretBox } from "../security/crypto";
import type { ConnectorRecord, SystemStore } from "../store/types";
import type { HubOAuth } from "./hub";
import { hubMetrics, sheetMetrics, type HubPerformanceRow, type HubProductRow, type HubReviewRow, type MetricsCore } from "./metrics";
import { toTable, type Table } from "./parse";

const CACHE_MS = 5 * 60_000;

export interface SheetConfig {
  spreadsheetId: string;
  range: string;
  dataset: SheetDataset;
}

export class ConnectorService {
  private readonly metricsCache = new Map<string, { at: number; value: ConnectorMetrics }>();
  private readonly hubTokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    private readonly deps: {
      system: SystemStore;
      box: SecretBox;
      google: GoogleGateway | null;
      hub: HubOAuth | null;
      clock?: () => Date;
    },
  ) {}

  get hub() {
    return this.deps.hub;
  }
  get google() {
    return this.deps.google;
  }
  private now() {
    return this.deps.clock?.() ?? new Date();
  }

  // ------------------------------------------------------------------ Hub
  async hubAccessToken(conn: ConnectorRecord): Promise<string> {
    if (!this.deps.hub) throw new IntegrationError("nao_configurado", "O conector do Sir Alfred Team Hub não está configurado no servidor.");
    const cached = this.hubTokens.get(conn.id);
    if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
    if (!conn.encryptedSecret) throw new IntegrationError("reconectar", "Reconecte o Sir Alfred Team Hub.");
    const fresh = await this.deps.hub.refresh(this.deps.box.decrypt(conn.encryptedSecret));
    // O Supabase rotaciona o refresh token: salvar o novo é obrigatório.
    const sealed = this.deps.box.encrypt(fresh.refreshToken);
    await this.deps.system.updateConnectorSecret(conn.id, sealed);
    conn.encryptedSecret = sealed;
    this.hubTokens.set(conn.id, { token: fresh.accessToken, expiresAt: fresh.expiresAt });
    return fresh.accessToken;
  }

  private async hubData(conn: ConnectorRecord) {
    const token = await this.hubAccessToken(conn);
    const hub = this.deps.hub!;
    const [perf, products, reviews] = await Promise.all([
      hub.select<HubPerformanceRow>(
        token,
        "performance_snapshots",
        "select=period_label,professional_name,services_count,comandas_count,revenue_cents,top_service,created_at&order=created_at.desc&limit=400",
      ),
      hub.select<HubProductRow>(token, "product_sales_snapshots", "select=period_label,professional_name,quantity,revenue_cents,top_product,created_at&order=created_at.desc&limit=400"),
      hub.select<HubReviewRow>(token, "client_reviews", "select=professional_name,stars,comment,review_date&order=review_date.desc&limit=300"),
    ]);
    return { perf, products, reviews };
  }

  // ------------------------------------------------------------------ Planilhas
  sheetConfig(conn: ConnectorRecord): SheetConfig {
    const cfg = conn.config as Partial<SheetConfig>;
    const dataset = SheetDatasetSchema.safeParse(cfg.dataset);
    if (!cfg.spreadsheetId || !cfg.range || !dataset.success) throw new IntegrationError("erro_conector", "Configuração da planilha inválida. Remova e adicione de novo.");
    return { spreadsheetId: cfg.spreadsheetId, range: cfg.range, dataset: dataset.data };
  }

  private async sheetTable(userId: string, cfg: SheetConfig): Promise<Table> {
    if (!this.deps.google) throw new IntegrationError("nao_configurado", "A integração com o Google não está configurada no servidor.");
    const sheets = await this.deps.google.forUser(userId).sheets();
    return toTable(await sheets.values(cfg.spreadsheetId, cfg.range));
  }

  /** Valida o acesso e descobre título/aba antes de salvar uma planilha. */
  async prepareSheet(userId: string, spreadsheet: string, range: string | undefined, dataset: SheetDataset) {
    const id = parseSpreadsheetId(spreadsheet);
    if (!id) throw new IntegrationError("erro_conector", "Link de planilha inválido. Cole o endereço docs.google.com/spreadsheets/d/…", 400);
    if (!this.deps.google) throw new IntegrationError("nao_configurado", "A integração com o Google não está configurada no servidor.");
    const sheets = await this.deps.google.forUser(userId).sheets();
    const meta = await sheets.title(id);
    const finalRange = range?.trim() || `'${(meta.firstSheet ?? "Página1").replace(/'/g, "''")}'!A1:Z1000`;
    const table = toTable(await sheets.values(id, finalRange));
    if (table.headers.length === 0) throw new IntegrationError("erro_conector", "A planilha (ou o intervalo) está vazia.", 400);
    const preview = sheetMetrics(dataset, table, localDate(this.now(), "America/Sao_Paulo"));
    return { config: { spreadsheetId: id, range: finalRange, dataset } satisfies SheetConfig, title: meta.title, headers: table.headers, rows: table.rows.length, preview };
  }

  // ------------------------------------------------------------------ Métricas
  async metrics(conn: ConnectorRecord, timezone: string, force = false): Promise<ConnectorMetrics> {
    const cached = this.metricsCache.get(conn.id);
    if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
    const today = localDate(this.now(), timezone);
    const base = { connectorId: conn.id, connectorName: conn.name, type: conn.type, fetchedAt: this.now().toISOString() };
    let core: MetricsCore;
    try {
      if (conn.type === "sir_alfred_hub") {
        const d = await this.hubData(conn);
        core = hubMetrics(d.perf, d.products, d.reviews, today);
      } else {
        const cfg = this.sheetConfig(conn);
        core = sheetMetrics(cfg.dataset, await this.sheetTable(conn.userId, cfg), today);
      }
      await this.deps.system.setConnectorStatus(conn.id, "active", null, true);
    } catch (e) {
      const message = e instanceof IntegrationError ? e.message : "Falha ao ler a fonte de dados.";
      await this.deps.system.setConnectorStatus(conn.id, "error", message, false).catch(() => undefined);
      const value: ConnectorMetrics = { ...base, period: null, kpis: [], highlights: [], alerts: [], error: message };
      return value; // erros não ficam em cache
    }
    const value: ConnectorMetrics = { ...base, ...core, error: null };
    this.metricsCache.set(conn.id, { at: Date.now(), value });
    return value;
  }

  async spaceMetrics(userId: string, space: Space | undefined, timezone: string, force = false): Promise<{ connectors: ConnectorRecord[]; metrics: ConnectorMetrics[] }> {
    const connectors = await this.deps.system.listConnectorsFor(userId, space);
    const metrics = await Promise.all(connectors.map((c) => this.metrics(c, timezone, force)));
    return { connectors, metrics };
  }

  /** Linhas brutas (para perguntas específicas), limitadas. */
  async rows(conn: ConnectorRecord, limit: number): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
    if (conn.type === "google_sheets") {
      const t = await this.sheetTable(conn.userId, this.sheetConfig(conn));
      return { headers: t.headers, rows: t.rows.slice(0, limit) };
    }
    const d = await this.hubData(conn);
    const latest = d.perf[0]?.period_label;
    const rows = d.perf
      .filter((r) => r.period_label === latest)
      .map((r) => ({
        periodo: r.period_label,
        profissional: r.professional_name,
        servicos: String(r.services_count),
        comandas: String(r.comandas_count),
        faturamento: (r.revenue_cents / 100).toFixed(2),
        servico_destaque: r.top_service ?? "",
      }));
    return { headers: Object.keys(rows[0] ?? {}), rows: rows.slice(0, limit) };
  }

  ownConnector(userId: string, id: string) {
    return this.deps.system.getConnector(userId, id);
  }

  forget(connectorId: string) {
    this.metricsCache.delete(connectorId);
    this.hubTokens.delete(connectorId);
  }
}
