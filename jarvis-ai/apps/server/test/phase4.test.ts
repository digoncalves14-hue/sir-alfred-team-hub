import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SpaceOverviewSchema } from "@jarvis/shared";
import { buildApp } from "../src/app";
import { Orchestrator } from "../src/agent/orchestrator";
import { ConnectorService } from "../src/business/connectors";
import { HubOAuth } from "../src/business/hub";
import { hubMetrics, orderedPeriods, sheetMetrics } from "../src/business/metrics";
import { findColumn, parseDate, parseNumber, toTable } from "../src/business/parse";
import { formatKpi, isDue, ReportGenerator, runKey } from "../src/business/reports";
import { AppError } from "../src/errors";
import { GoogleGateway } from "../src/google/gateway";
import { GoogleOAuth } from "../src/google/oauth";
import { parseSpreadsheetId } from "../src/google/sheets";
import { ExpoPushSender } from "../src/push/expo";
import { Scheduler } from "../src/scheduler/scheduler";
import { SecretBox } from "../src/security/crypto";
import { createMemoryDb, MemorySystemStore, MemoryUserStore } from "../src/store/memory-store";
import { createDefaultRegistry } from "../src/tools/builtin";
import { ElevenLabsTts } from "../src/tts/elevenlabs";
import { FakeGoogle, FakeHub } from "./fake-google";
import { ScriptedProvider, call, text } from "./fake-provider";

const TZ = "America/Sao_Paulo";

describe("leitura de planilhas brasileiras", () => {
  it.each([
    ["R$ 1.234,56", 1234.56],
    ["1234,5", 1234.5],
    ["1,234.56", 1234.56],
    ["12.500", 12500],
    ["85%", 85],
    ["(150,00)", -150],
    ["-3", -3],
    ["abc", null],
    ["", null],
  ])("número %s → %s", (raw, expected) => expect(parseNumber(raw)).toBe(expected));

  it("datas e cabeçalhos", () => {
    expect(parseDate("05/11/2026")).toBe("2026-11-05");
    expect(parseDate("5/1/26 14:30")).toBe("2026-01-05");
    expect(parseDate("2026-11-05T10:00")).toBe("2026-11-05");
    expect(parseDate("31/13/2026")).toBeNull();
    expect(findColumn(["Data da Venda", "Produto", "Valor Total (R$)"], ["valor total", "valor"])).toBe("Valor Total (R$)");
    expect(findColumn(["Situação do pedido"], ["status", "situacao"])).toBe("Situação do pedido");
    expect(parseSpreadsheetId("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0")).toBe(
      "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
    );
    expect(parseSpreadsheetId("nao é planilha")).toBeNull();
  });
});

describe("indicadores de planilhas", () => {
  const today = "2026-11-05";

  it("vendas: últimos 30 dias vs anteriores, ticket e mais vendido", () => {
    const t = toTable([
      ["Data", "Produto", "Qtd", "Valor"],
      ["01/11/2026", "Pomada Matte", "2", "R$ 120,00"],
      ["03/11/2026", "Óleo de Barba", "1", "R$ 80,00"],
      ["20/10/2026", "Pomada Matte", "1", "R$ 60,00"],
      ["15/09/2026", "Pomada Matte", "1", "R$ 100,00"],
      ["", "", "", ""],
    ]);
    const m = sheetMetrics("vendas", t, today);
    const k = Object.fromEntries(m.kpis.map((x) => [x.key, x]));
    expect(k.faturamento!.value).toBe(260);
    expect(k.faturamento!.changePct).toBe(160); // 260 vs 100
    expect(k.vendas!.value).toBe(3);
    expect(k.ticket!.value).toBeCloseTo(86.67, 2);
    expect(k.itens!.value).toBe(4);
    expect(k.top_produto!.text).toBe("Pomada Matte");
    expect(m.highlights[0]).toContain("1º Pomada Matte");
  });

  it("estoque: zerados e abaixo do mínimo viram alertas", () => {
    const t = toTable([
      ["Produto", "Estoque atual", "Estoque mínimo"],
      ["Pomada Matte", "3", "10"],
      ["Shampoo Kids", "0", "5"],
      ["Óleo", "40", "10"],
    ]);
    const m = sheetMetrics("estoque", t, today);
    expect(m.kpis.find((k) => k.key === "abaixo_minimo")!.value).toBe(1);
    expect(m.alerts).toEqual(["Shampoo Kids: SEM ESTOQUE", "Pomada Matte: 3 (mínimo 10)"]);
  });

  it("pedidos, cronograma, indicadores e coluna ausente", () => {
    const pedidos = sheetMetrics(
      "pedidos",
      toTable([
        ["Pedido", "Data", "Status", "Total"],
        ["1001", "20/10/2026", "Aguardando envio", "150"],
        ["1002", "04/11/2026", "Entregue", "90"],
        ["1003", "04/11/2026", "Pago", "60"],
      ]),
      today,
    );
    expect(pedidos.kpis.find((k) => k.key === "em_aberto")!.value).toBe(2);
    expect(pedidos.kpis.find((k) => k.key === "valor_aberto")!.value).toBe(210);
    expect(pedidos.alerts).toEqual(['Pedido 1001 em "Aguardando envio" desde 2026-10-20']);

    const crono = sheetMetrics(
      "cronograma",
      toTable([
        ["Data", "Horário", "Aula"],
        ["06/11/2026", "19h", "Genesis Barber — Degradê"],
        ["20/11/2026", "19:00", "Fora da janela"],
        ["05/11/2026", "08:30", "Mentoria CODE S.O.S."],
      ]),
      today,
    );
    expect(crono.highlights).toEqual(["2026-11-05 08:30 — Mentoria CODE S.O.S.", "2026-11-06 19:00 — Genesis Barber — Degradê"]);

    const ind = sheetMetrics("indicadores", toTable([["Indicador", "Realizado", "Meta"], ["Alunos ativos", "42", "60"], ["NPS", "78", "75"]]), today);
    expect(ind.alerts).toEqual(["Alunos ativos: 70% da meta"]);

    expect(sheetMetrics("vendas", toTable([["Data", "Produto"], ["01/11/2026", "x"]]), today).alerts[0]).toContain("Não encontrei a coluna de valor");
  });
});

describe("indicadores do Sir Alfred Team Hub", () => {
  const perf = [
    { period_label: "Outubro/2026", professional_name: "Rafael", services_count: 120, comandas_count: 100, revenue_cents: 600000, top_service: "Corte", created_at: "2026-11-01T10:00:00Z" },
    { period_label: "Outubro/2026", professional_name: "Bruno", services_count: 80, comandas_count: 70, revenue_cents: 350000, top_service: "Barba", created_at: "2026-11-01T10:00:00Z" },
    { period_label: "Setembro/2026", professional_name: "Rafael", services_count: 100, comandas_count: 90, revenue_cents: 500000, top_service: "Corte", created_at: "2026-10-01T10:00:00Z" },
    { period_label: "Setembro/2026", professional_name: "Bruno", services_count: 90, comandas_count: 80, revenue_cents: 500000, top_service: "Barba", created_at: "2026-10-01T10:00:00Z" },
  ];
  const products = [{ period_label: "Outubro/2026", professional_name: "Rafael", quantity: 30, revenue_cents: 90000, top_product: "Pomada Black Bear", created_at: "2026-11-01T10:00:00Z" }];
  const reviews = [
    { professional_name: "Rafael", stars: 5, comment: null, review_date: "2026-11-02" },
    { professional_name: "Bruno", stars: 2, comment: "Atrasou 30 minutos", review_date: "2026-11-03" },
    { professional_name: "Bruno", stars: 1, comment: "antiga", review_date: "2026-08-01" },
  ];

  it("faturamento, variação, ticket, ranking, produtos e avaliações", () => {
    expect(orderedPeriods(perf)).toEqual(["Outubro/2026", "Setembro/2026"]);
    const m = hubMetrics(perf, products, reviews, "2026-11-05");
    const k = Object.fromEntries(m.kpis.map((x) => [x.key, x]));
    expect(m.period).toBe("Outubro/2026");
    expect(k.faturamento).toMatchObject({ value: 9500, changePct: -5 });
    expect(k.servicos).toMatchObject({ value: 200, changePct: 5.3 });
    expect(k.ticket!.value).toBeCloseTo(55.88, 2);
    expect(k.top_profissional!.text).toBe("Rafael");
    expect(k.produtos!.value).toBe(900);
    expect(k.avaliacao).toMatchObject({ value: 3.5, text: "2 avaliações" });
    expect(m.highlights[0]).toBe("1º Rafael: R$ 6.000,00 (120 serviços)");
    expect(m.alerts).toContain("Bruno: faturamento -30% vs Setembro/2026");
    expect(m.alerts).toContain('★2 para Bruno em 2026-11-03: "Atrasou 30 minutos"');
    expect(m.alerts.join()).not.toContain("antiga");
    expect(formatKpi(k.faturamento!)).toBe("Faturamento: R$ 9.500,00 (-5% vs anterior)");
  });

  it("sem dados não inventa números", () => {
    expect(hubMetrics([], [], [], "2026-11-05")).toEqual({ period: null, kpis: [], highlights: [], alerts: [] });
  });
});

describe("agenda das automações", () => {
  it("semana ISO e janela de execução", () => {
    expect(runKey(new Date("2026-11-05T15:00:00Z"), TZ, true)).toBe("2026-W45");
    expect(runKey(new Date("2027-01-01T15:00:00Z"), TZ, true)).toBe("2026-W53");
    expect(runKey(new Date("2024-12-30T15:00:00Z"), TZ, true)).toBe("2025-W01");
    expect(runKey(new Date("2026-11-05T02:00:00Z"), TZ, false)).toBe("2026-11-04"); // 23h em SP
    const a = { weekday: 1, runTime: "08:00", timezone: TZ };
    expect(isDue(a, new Date("2026-11-09T11:05:00Z"))).toBe(true); // segunda 08:05
    expect(isDue(a, new Date("2026-11-09T10:55:00Z"))).toBe(false); // 07:55
    expect(isDue(a, new Date("2026-11-10T11:05:00Z"))).toBe(false); // terça
    expect(isDue(a, new Date("2026-11-09T16:00:00Z"))).toBe(false); // 13:00, atraso > 3 h
    expect(isDue({ ...a, weekday: null }, new Date("2026-11-10T11:05:00Z"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integração ponta a ponta (API + conectores + agendador)
// ---------------------------------------------------------------------------
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TOKENS: Record<string, string> = { "token-a": A, "token-b": B };
const auth = (t = "token-a") => ({ authorization: `Bearer ${t}` });
const SHEET_ID = "1StockSheetIdBlackBear0123456789abcdef";

const google = new FakeGoogle();
const hubFake = new FakeHub();
const db = createMemoryDb();
const system = new MemorySystemStore(db);
const box = new SecretBox(randomBytes(32).toString("base64"));
const gateway = new GoogleGateway({ oauth: new GoogleOAuth("123-abc.apps.googleusercontent.com", box, google.fetch), system, box, fetchImpl: google.fetch });
const hub = new HubOAuth({ url: hubFake.base, publishableKey: "hub-publishable-key-123", clientId: "jarvis-client" }, box, hubFake.fetch);
const connectors = new ConnectorService({ system, box, google: gateway, hub });
const reports = new ReportGenerator({ system, connectors });
const provider = new ScriptedProvider([]);
const script = (...steps: ConstructorParameters<typeof ScriptedProvider>[0]) => {
  (provider as unknown as { steps: unknown[] }).steps = steps;
};
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp({
    logger: false,
    authenticate: async (token) => {
      const userId = TOKENS[token];
      if (!userId) throw new AppError("nao_autenticado", 401, "Sessão inválida");
      return new MemoryUserStore(userId, db);
    },
    provider,
    tts: new ElevenLabsTts({ modelId: "x" }),
    ttsCostPer1kChars: 0.1,
    rateLimitPerMinute: 1000,
    orchestrator: new Orchestrator({
      provider,
      registry: createDefaultRegistry(),
      maxToolIterations: 4,
      historyMessages: 20,
      googleFor: (id) => gateway.forUser(id),
      business: { connectors, reports },
    }),
    phase2: { system, google: gateway, box },
    phase4: { system, box, connectors, reports },
  });
  google.spreadsheets.set(SHEET_ID, {
    title: "Estoque Black Bear",
    tabs: [
      {
        name: "Estoque",
        values: [
          ["Produto", "Estoque atual", "Estoque mínimo"],
          ["Pomada Matte", "3", "10"],
          ["Balm", "25", "10"],
        ],
      },
    ],
  });
  hubFake.tables.performance_snapshots = [
    { period_label: "Outubro/2026", professional_name: "Rafael", services_count: 120, comandas_count: 100, revenue_cents: 600000, top_service: "Corte", created_at: "2026-11-01T10:00:00Z" },
  ];
});
afterAll(() => app.close());

describe("API de negócios", () => {
  it("sem fontes conectadas: visão honesta e o Jarvis não inventa números", async () => {
    const r = await app.inject({ url: "/v1/business/overview", headers: auth() });
    const spaces = r.json().spaces.map((s: unknown) => SpaceOverviewSchema.parse(s));
    expect(spaces.map((s: { space: string }) => s.space)).toEqual(["sir_alfred", "black_bear", "barton", "alfie_fred", "educacao"]);
    expect(spaces.every((s: { metrics: unknown[] }) => s.metrics.length === 0)).toBe(true);

    script(call("negocio_indicadores", { espaco: "black_bear" }), text("Ainda não há fonte conectada para a Black Bear."));
    await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "quanto a Black Bear vendeu?" } });
    const part = provider.requests.at(-1)!.turns.at(-1)!.parts[0]!;
    expect(part.type === "tool_result" && part.content).toContain("Nenhuma fonte de dados conectada para Black Bear");
  });

  it("planilha exige o Google Planilhas autorizado", async () => {
    await system.upsertIntegration({ userId: A, provider: "google", accountEmail: "a@x.com", scopes: [], services: ["calendar"], encryptedRefreshToken: box.encrypt("rt") });
    const r = await app.inject({
      method: "POST",
      url: "/v1/connectors/sheets",
      headers: auth(),
      payload: { space: "black_bear", name: "Estoque", spreadsheet: SHEET_ID, dataset: "estoque" },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.message).toContain("Google Planilhas");
  });

  it("conecta planilha de estoque, mostra prévia e indicadores no espaço certo", async () => {
    await system.upsertIntegration({ userId: A, provider: "google", accountEmail: "a@x.com", scopes: [], services: ["calendar", "sheets"], encryptedRefreshToken: box.encrypt("rt") });
    const bad = await app.inject({ method: "POST", url: "/v1/connectors/sheets", headers: auth(), payload: { space: "black_bear", name: "X", spreadsheet: "https://exemplo.com/planilha", dataset: "estoque" } });
    expect(bad.statusCode).toBe(400);

    const r = await app.inject({
      method: "POST",
      url: "/v1/connectors/sheets",
      headers: auth(),
      payload: { space: "black_bear", name: "Estoque", spreadsheet: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`, dataset: "estoque" },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ connector: { type: "google_sheets", accountLabel: "Estoque Black Bear", config: { range: "'Estoque'!A1:Z1000" } }, rows: 2 });
    expect(r.json().preview.alerts).toEqual(["Pomada Matte: 3 (mínimo 10)"]);

    const ov = (await app.inject({ url: "/v1/business/overview?space=black_bear", headers: auth() })).json().spaces[0];
    expect(ov.metrics[0].kpis.find((k: { key: string }) => k.key === "abaixo_minimo").value).toBe(1);
    expect((await app.inject({ url: "/v1/business/overview?space=sir_alfred", headers: auth() })).json().spaces[0].metrics).toHaveLength(0);
    // Outro usuário não vê a fonte
    expect((await app.inject({ url: "/v1/connectors", headers: auth("token-b") })).json().connectors).toHaveLength(0);
  });

  it("conecta o Sir Alfred Team Hub via OAuth (PKCE) e salva o refresh token ROTACIONADO", async () => {
    const start = (await app.inject({ method: "POST", url: "/v1/connectors/hub/start", headers: auth() })).json();
    const u = new URL(start.authUrl);
    expect(u.origin + u.pathname).toBe(`${hubFake.base}/auth/v1/oauth/authorize`);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("redirect_uri")).toBe("jarvis://hub-oauth");
    expect(u.searchParams.has("client_secret")).toBe(false);
    const state = u.searchParams.get("state")!;

    expect((await app.inject({ method: "POST", url: "/v1/connectors/hub/complete", headers: auth("token-b"), payload: { code: "hub-code", state } })).statusCode).toBe(400);
    const done = await app.inject({ method: "POST", url: "/v1/connectors/hub/complete", headers: auth(), payload: { code: "hub-code", state } });
    expect(done.json()).toMatchObject({ connected: true, accountLabel: "dono@siralfred.com" });

    const conn = db.connectors.find((c) => c.type === "sir_alfred_hub")!;
    const firstSecret = conn.encryptedSecret!;
    expect(box.decrypt(firstSecret)).toMatch(/^hub-rt-/);

    const ov = (await app.inject({ url: "/v1/business/overview?space=sir_alfred&refresh=1", headers: auth() })).json().spaces[0];
    expect(ov.metrics[0]).toMatchObject({ connectorName: "Sir Alfred Team Hub", period: "Outubro/2026", error: null });
    expect(ov.metrics[0].kpis[0]).toMatchObject({ key: "faturamento", value: 6000 });
    // Rotação: o segredo salvo mudou e o antigo já não vale
    expect(conn.encryptedSecret).not.toBe(firstSecret);
    expect(hubFake.validRefresh.has(box.decrypt(firstSecret))).toBe(false);
    expect(hubFake.validRefresh.has(box.decrypt(conn.encryptedSecret!))).toBe(true);
    // A chave pública do Hub vai no apikey; o token do dono no Authorization
    const restCall = hubFake.calls.find((c) => c.url.includes("/rest/v1/performance_snapshots"))!;
    expect(restCall.headers.apikey).toBe("hub-publishable-key-123");
  });

  it("o Jarvis responde com os números reais e isola fontes por usuário", async () => {
    script(call("negocio_indicadores", { espaco: "sir_alfred" }), text("Em outubro, o Sir Alfred faturou R$ 6.000."));
    await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "como foi o faturamento do Sir Alfred?" } });
    const part = provider.requests.at(-1)!.turns.at(-1)!.parts[0]!;
    expect(part.type === "tool_result" && part.content).toContain("Faturamento: R$ 6.000,00");
    expect(part.type === "tool_result" && part.content).toMatch(/^<dados_externos origem="negocios">/);

    const connId = db.connectors.find((c) => c.type === "sir_alfred_hub")!.id;
    script(call("negocio_dados", { conector_id: connId }), text("Não encontrei."));
    await app.inject({ method: "POST", url: "/v1/chat", headers: auth("token-b"), payload: { message: "dados" } });
    const other = provider.requests.at(-1)!.turns.at(-1)!.parts[0]!;
    expect(other.type === "tool_result" && other.content).toBe("Fonte não encontrada.");
  });

  it("automações: usuário cria, executa agora e lê o relatório", async () => {
    const created = await app.inject({ method: "POST", url: "/v1/automations", headers: auth(), payload: { kind: "relatorio_negocios", space: "sir_alfred", weekday: 1, runTime: "08:00" } });
    expect(created.statusCode).toBe(201);
    const id = created.json().automation.id;
    expect((await app.inject({ method: "POST", url: "/v1/automations", headers: auth(), payload: { kind: "inexistente" } })).statusCode).toBe(400);

    const run = (await app.inject({ method: "POST", url: `/v1/automations/${id}/run`, headers: auth() })).json().report;
    expect(run.title).toBe("Relatório semanal — Sir Alfred");
    expect(run.body).toContain("Faturamento: R$ 6.000,00");
    expect((await app.inject({ url: `/v1/reports/${run.id}`, headers: auth("token-b") })).statusCode).toBe(404);
    expect((await app.inject({ url: "/v1/reports", headers: auth() })).json().reports.length).toBeGreaterThan(0);

    expect((await app.inject({ method: "PATCH", url: `/v1/automations/${id}`, headers: auth("token-b"), payload: { enabled: false } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: `/v1/automations/${id}`, headers: auth(), payload: { runTime: "25:00" } })).statusCode).toBe(400);
  });

  it("gera relatório sob demanda no espaço pedido", async () => {
    const r = await app.inject({ method: "POST", url: "/v1/reports/generate", headers: auth(), payload: { kind: "alerta_estoque", space: "black_bear" } });
    expect(r.statusCode).toBe(201);
    expect(r.json().report.body).toContain("Pomada Matte: 3 (mínimo 10)");
    expect((await app.inject({ method: "POST", url: "/v1/reports/generate", headers: auth(), payload: { kind: "x" } })).statusCode).toBe(400);
  });

  it("remover fonte apaga a credencial", async () => {
    const conn = db.connectors.find((c) => c.type === "google_sheets")!;
    expect((await app.inject({ method: "DELETE", url: `/v1/connectors/${conn.id}`, headers: auth("token-b") })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: `/v1/connectors/${conn.id}`, headers: auth() })).statusCode).toBe(204);
    expect(db.connectors.find((c) => c.id === conn.id)).toBeUndefined();
  });
});

describe("agendador de automações", () => {
  let clock: Date;
  let scheduler: Scheduler;
  const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  beforeEach(async () => {
    db.automations = []; // isola das automações criadas nos testes anteriores
    await new MemoryUserStore(C, db).updateProfile({ dailySummaryEnabled: false });
    await system.upsertPushToken(C, "ExponentPushToken[c]");
    clock = new Date("2026-11-09T11:05:00Z"); // segunda 08:05 em SP
    scheduler = new Scheduler({
      system,
      google: null,
      reports: new ReportGenerator({ system, connectors, clock: () => clock }),
      push: new ExpoPushSender(system, { fetchImpl: google.fetch }),
      clock: () => clock,
    });
  });

  it("relatório semanal roda uma vez por semana", async () => {
    const store = new MemoryUserStore(C, db);
    await store.createTask({ title: "Renovar alvará", space: "sir_alfred", priority: "alta", dueDate: "2026-11-01" });
    await store.createAutomation({ kind: "pendencias", space: null, weekday: 1, runTime: "08:00", enabled: true });
    expect((await scheduler.tick()).automations).toBe(1);
    expect((await scheduler.tick()).automations).toBe(0);
    const [rep] = await store.listReports(5);
    expect(rep!.body).toContain("Renovar alvará — prazo 2026-11-01 (ATRASADA)");
    clock = new Date("2026-11-16T11:05:00Z"); // próxima segunda
    expect((await scheduler.tick()).automations).toBe(1);
  });

  it("alerta diário só gera aviso quando há algo; desligada não roda", async () => {
    const store = new MemoryUserStore(C, db);
    const a = await store.createAutomation({ kind: "tarefas_atrasadas", space: null, weekday: null, runTime: "08:00", enabled: true });
    db.tasks = db.tasks.filter((t) => t.userId !== C);
    expect((await scheduler.tick()).automations).toBe(0); // nada atrasado: sem aviso nem relatório
    await store.updateAutomation(a.id, { enabled: false });
    await store.createTask({ title: "Pagar fornecedor", space: "black_bear", priority: "alta", dueDate: "2026-11-01" });
    clock = new Date("2026-11-10T11:05:00Z");
    expect((await scheduler.tick()).automations).toBe(0);
    await store.updateAutomation(a.id, { enabled: true });
    clock = new Date("2026-11-11T11:05:00Z");
    expect((await scheduler.tick()).automations).toBe(1);
  });
});
