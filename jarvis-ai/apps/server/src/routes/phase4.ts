/** Rotas da Fase 4: visão dos negócios, conectores, relatórios e automações. */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  AutomationCreateSchema,
  AutomationUpdateSchema,
  OAuthCompleteRequestSchema,
  SheetConnectorCreateSchema,
  SPACES,
  SpaceSchema,
  type SpaceOverview,
} from "@jarvis/shared";
import { AppError, notFound } from "../errors";
import type { ConnectorService } from "../business/connectors";
import type { ReportGenerator } from "../business/reports";
import { IntegrationError } from "../google/errors";
import type { SecretBox } from "../security/crypto";
import type { SystemStore } from "../store/types";

export interface Phase4Deps {
  system: SystemStore | null;
  box: SecretBox | null;
  connectors: ConnectorService | null;
  reports: ReportGenerator | null;
}

const IdParams = z.object({ id: z.string().uuid() });
const STATUS_BY_CODE: Record<string, number> = {
  nao_configurado: 503,
  nao_conectado: 409,
  servico_nao_autorizado: 403,
  reconectar: 409,
};
const toApp = (e: unknown) =>
  e instanceof IntegrationError ? new AppError(e.code, e.status && e.status < 500 ? e.status : (STATUS_BY_CODE[e.code] ?? 502), e.message) : e;

export async function registerPhase4Routes(v1: FastifyInstance, deps: Phase4Deps) {
  const need = () => {
    if (!deps.system || !deps.box || !deps.connectors || !deps.reports) {
      throw new AppError("negocios_nao_configurado", 503, "Os conectores de negócios exigem SUPABASE_SERVICE_ROLE_KEY e TOKEN_ENCRYPTION_KEY no servidor.");
    }
    return { system: deps.system, box: deps.box, connectors: deps.connectors, reports: deps.reports };
  };

  // ---- Visão geral ----
  v1.get("/business/overview", async (req): Promise<{ spaces: SpaceOverview[] }> => {
    const q = z.object({ space: SpaceSchema.optional(), refresh: z.enum(["0", "1"]).default("0") }).parse(req.query);
    const profile = await req.store.getProfile();
    const spaces = q.space ? [q.space] : SPACES.filter((s) => s !== "pessoal");
    const [tasks, memories] = await Promise.all([req.store.listTasks({ status: "aberta", limit: 500 }), req.store.listMemories({ limit: 1000 })]);
    const out: SpaceOverview[] = [];
    for (const space of spaces) {
      const connectors = await req.store.listConnectors(space);
      const metrics = deps.connectors && connectors.length ? (await deps.connectors.spaceMetrics(req.store.userId, space, profile.timezone, q.refresh === "1")).metrics : [];
      out.push({
        space,
        connectors,
        metrics,
        openTasks: tasks.filter((t) => t.space === space).length,
        memories: memories.filter((m) => m.space === space).length,
      });
    }
    return { spaces: out };
  });

  // ---- Conectores ----
  v1.get("/connectors", async (req) => ({
    connectors: await req.store.listConnectors(),
    available: { hub: Boolean(deps.connectors?.hub), sheets: Boolean(deps.connectors?.google) },
  }));

  v1.post("/connectors/sheets", async (req, reply) => {
    const { system, connectors } = need();
    const body = SheetConnectorCreateSchema.parse(req.body);
    try {
      const prepared = await connectors.prepareSheet(req.store.userId, body.spreadsheet, body.range, body.dataset);
      const conn = await system.createConnector({
        userId: req.store.userId,
        space: body.space,
        type: "google_sheets",
        name: body.name,
        config: prepared.config,
        encryptedSecret: null,
        accountLabel: prepared.title,
      });
      await req.store.logAction({ tool: "app:conectar_planilha", status: "executed", summary: `Planilha "${prepared.title}" conectada a ${body.space}` });
      const { userId: _u, encryptedSecret: _s, ...pub } = conn;
      return reply.status(201).send({ connector: pub, headers: prepared.headers, rows: prepared.rows, preview: prepared.preview });
    } catch (e) {
      throw toApp(e);
    }
  });

  v1.post("/connectors/hub/start", async (req) => {
    const { connectors } = need();
    if (!connectors.hub) throw new AppError("hub_nao_configurado", 503, "O servidor não tem HUB_SUPABASE_URL, HUB_PUBLISHABLE_KEY e HUB_OAUTH_CLIENT_ID.");
    return connectors.hub.start(req.store.userId);
  });

  v1.post("/connectors/hub/complete", async (req) => {
    const { system, box, connectors } = need();
    if (!connectors.hub) throw new AppError("hub_nao_configurado", 503, "Hub não configurado no servidor.");
    const { code, state } = OAuthCompleteRequestSchema.parse(req.body);
    try {
      const tokens = await connectors.hub.complete(req.store.userId, code, state);
      const conn = await system.createConnector({
        userId: req.store.userId,
        space: "sir_alfred",
        type: "sir_alfred_hub",
        name: "Sir Alfred Team Hub",
        config: { url: connectors.hub.cfg.url },
        encryptedSecret: box.encrypt(tokens.refreshToken),
        accountLabel: tokens.email,
      });
      await req.store.logAction({ tool: "app:conectar_hub", status: "executed", summary: `Sir Alfred Team Hub conectado${tokens.email ? ` (${tokens.email})` : ""}` });
      return { connected: true, connectorId: conn.id, accountLabel: tokens.email };
    } catch (e) {
      throw toApp(e);
    }
  });

  v1.post("/connectors/:id/refresh", async (req) => {
    const { connectors } = need();
    const { id } = IdParams.parse(req.params);
    const conn = await connectors.ownConnector(req.store.userId, id);
    if (!conn) throw notFound("Conector");
    return { metrics: await connectors.metrics(conn, (await req.store.getProfile()).timezone, true) };
  });

  v1.delete("/connectors/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    if (!(await req.store.deleteConnector(id))) throw notFound("Conector");
    deps.connectors?.forget(id);
    await req.store.logAction({ tool: "app:remover_conector", status: "executed", summary: "Fonte de dados removida e credencial apagada" });
    return reply.status(204).send();
  });

  // ---- Relatórios ----
  v1.get("/reports", async (req) => {
    const q = z.object({ space: SpaceSchema.optional() }).parse(req.query);
    return { reports: await req.store.listReports(50, q.space) };
  });
  v1.get("/reports/:id", async (req) => {
    const { id } = IdParams.parse(req.params);
    const report = await req.store.getReport(id);
    if (!report) throw notFound("Relatório");
    return { report };
  });
  v1.delete("/reports/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    if (!(await req.store.deleteReport(id))) throw notFound("Relatório");
    return reply.status(204).send();
  });

  v1.post("/reports/generate", async (req, reply) => {
    const { reports } = need();
    const body = z.object({ kind: AutomationCreateSchema.shape.kind, space: SpaceSchema.nullable().default(null) }).parse(req.body);
    const { report } = await reports.run(body.kind, req.store.userId, body.space, (await req.store.getProfile()).timezone);
    return reply.status(201).send({ report });
  });

  // ---- Automações (controladas pelo usuário) ----
  v1.get("/automations", async (req) => ({ automations: await req.store.listAutomations() }));
  v1.post("/automations", async (req, reply) => {
    const body = AutomationCreateSchema.parse(req.body);
    const automation = await req.store.createAutomation(body);
    await req.store.logAction({ tool: "app:criar_automacao", status: "executed", summary: `Automação criada: ${body.kind}` });
    return reply.status(201).send({ automation });
  });
  v1.patch("/automations/:id", async (req) => {
    const { id } = IdParams.parse(req.params);
    const automation = await req.store.updateAutomation(id, AutomationUpdateSchema.parse(req.body));
    if (!automation) throw notFound("Automação");
    return { automation };
  });
  v1.delete("/automations/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    if (!(await req.store.deleteAutomation(id))) throw notFound("Automação");
    return reply.status(204).send();
  });
  v1.post("/automations/:id/run", async (req) => {
    const { reports } = need();
    const { id } = IdParams.parse(req.params);
    const automation = (await req.store.listAutomations()).find((a) => a.id === id);
    if (!automation) throw notFound("Automação");
    const { report } = await reports.run(automation.kind, req.store.userId, automation.space, (await req.store.getProfile()).timezone);
    return { report };
  });
}
