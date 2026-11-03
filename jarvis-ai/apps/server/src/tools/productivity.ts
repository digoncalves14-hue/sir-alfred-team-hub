/**
 * Ferramentas da Fase 2: Google Agenda, Gmail, tarefas/lembretes e resumo do dia.
 *
 * Regras:
 *  - Consultas (read) executam direto.
 *  - Criar tarefa/rascunho (write) é reversível e não envia nada para terceiros.
 *  - Criar/reagendar/cancelar evento, enviar e-mail e apagar tarefa (confirm) só
 *    acontecem após o usuário tocar em Confirmar no app.
 *  - Sucesso só é declarado com resposta positiva da API.
 *  - Conteúdo vindo de agenda/e-mail é delimitado como dado não confiável.
 */
import { z } from "zod";
import { SpaceSchema, TaskPrioritySchema, type Task } from "@jarvis/shared";
import { addDays, humanDateTime, localDate, localToUtc, toLocalIso } from "../agent/time";
import { buildDay, summaryText } from "../agent/summary";
import { findConflicts, type EventWithInstants } from "../google/calendar";
import { buildRawEmail, isValidEmail } from "../google/gmail";
import { IntegrationError } from "../google/errors";
import { wrapUntrusted } from "../security/untrusted";
import { defineTool, type ToolContext, type ToolOutcome } from "./registry";

const LOCAL_DATETIME = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use AAAA-MM-DDTHH:MM no fuso do usuário")
  .describe("Data e hora LOCAIS do usuário, formato AAAA-MM-DDTHH:MM (ex.: 2026-11-05T15:00)");
const LOCAL_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD").describe("Data local AAAA-MM-DD");
const EMAIL = z.string().refine(isValidEmail, "E-mail inválido");

/** Converte erros de integração em resposta honesta (nada foi feito). */
async function guarded(fn: () => Promise<ToolOutcome>): Promise<ToolOutcome> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof IntegrationError) {
      return { content: `NÃO EXECUTADO: ${e.message}`, summary: e.message, isError: true };
    }
    throw e;
  }
}

function requireGoogle(ctx: ToolContext) {
  if (!ctx.google) throw new IntegrationError("nao_configurado", "A integração com o Google ainda não foi configurada no servidor do Jarvis.");
  return ctx.google;
}

const plusMinutes = (local: string, minutes: number, tz: string) => toLocalIso(new Date(localToUtc(local, tz).getTime() + minutes * 60_000), tz);

function describeEvent(e: EventWithInstants, tz: string) {
  return e.allDay ? `${e.title} (dia inteiro)` : `${e.title}, ${humanDateTime(e.startAt, tz)} até ${humanDateTime(e.endAt, tz, false)}`;
}

function eventLine(e: EventWithInstants) {
  return `- [id=${e.id}] ${e.allDay ? `${e.start} (dia inteiro)` : `${e.start} → ${e.end}`} | ${e.title}${e.location ? ` | local: ${e.location}` : ""}`;
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------
export const listEventsTool = defineTool({
  name: "agenda_consultar",
  label: "Agenda consultada",
  description:
    "Lista os compromissos do Google Agenda do usuário num intervalo de datas locais e aponta conflitos (sobreposições). " +
    "Use para 'o que temos hoje/amanhã', revisar ou organizar a agenda.",
  input: z.object({ data_inicio: LOCAL_DATE, data_fim: LOCAL_DATE.optional().describe("Inclusiva. Padrão: igual a data_inicio") }),
  risk: "read",
  execute: (input, ctx) =>
    guarded(async () => {
      const tz = ctx.profile.timezone;
      const last = input.data_fim ?? input.data_inicio;
      if (last < input.data_inicio) return { content: "data_fim anterior a data_inicio.", summary: "Intervalo inválido", isError: true };
      const cal = await requireGoogle(ctx).calendar();
      const events = await cal.list(localToUtc(input.data_inicio, tz), localToUtc(addDays(last, 1), tz), tz, 100);
      if (events.length === 0) return { content: "Nenhum compromisso no período.", summary: "Agenda livre no período" };
      const conflicts: string[] = [];
      events.forEach((a, i) =>
        events.slice(i + 1).forEach((b) => {
          if (findConflicts([b], a.startAt, a.endAt).length && a.busy) conflicts.push(`"${a.title}" x "${b.title}"`);
        }),
      );
      const text = events.map(eventLine).join("\n") + (conflicts.length ? `\nCONFLITOS: ${conflicts.join("; ")}` : "\nSem conflitos.");
      return {
        content: wrapUntrusted("google_agenda", text),
        summary: `${events.length} compromisso(s) encontrados${conflicts.length ? `, ${conflicts.length} conflito(s)` : ""}`,
      };
    }),
});

export const availabilityTool = defineTool({
  name: "agenda_verificar_disponibilidade",
  label: "Disponibilidade verificada",
  description: "Verifica se um horário está livre na agenda (antes de propor ou criar um compromisso).",
  input: z.object({ inicio: LOCAL_DATETIME, duracao_minutos: z.number().int().min(5).max(24 * 60).default(60) }),
  risk: "read",
  execute: (input, ctx) =>
    guarded(async () => {
      const tz = ctx.profile.timezone;
      const start = localToUtc(input.inicio, tz);
      const end = new Date(start.getTime() + input.duracao_minutos * 60_000);
      const cal = await requireGoogle(ctx).calendar();
      const events = await cal.list(new Date(start.getTime() - 12 * 3600_000), new Date(end.getTime() + 12 * 3600_000), tz, 100);
      const conflicts = findConflicts(events, start, end);
      if (conflicts.length === 0) return { content: `Livre: ${humanDateTime(start, tz)} por ${input.duracao_minutos} min.`, summary: "Horário livre" };
      return {
        content: wrapUntrusted("google_agenda", `OCUPADO. Conflitos:\n${conflicts.map(eventLine).join("\n")}`),
        summary: `Conflito com ${conflicts.length} compromisso(s)`,
      };
    }),
});

const createEventInput = z.object({
  titulo: z.string().trim().min(1).max(200),
  inicio: LOCAL_DATETIME,
  duracao_minutos: z.number().int().min(5).max(24 * 60).default(60),
  local: z.string().max(200).optional(),
  descricao: z.string().max(2000).optional(),
  convidados: z.array(EMAIL).max(20).optional().describe("E-mails dos convidados. Eles receberão convite por e-mail."),
});

export const createEventTool = defineTool({
  name: "agenda_criar_evento",
  label: "Criar compromisso",
  description:
    "Cria um compromisso no Google Agenda. NÃO é executado na hora: o usuário confirma no app. " +
    "Verifique a disponibilidade antes e pergunte o horário se ele não foi informado.",
  input: createEventInput,
  risk: "confirm",
  async describe(input, ctx) {
    const tz = ctx.profile.timezone;
    const start = localToUtc(input.inicio, tz);
    const end = new Date(start.getTime() + input.duracao_minutos * 60_000);
    // Já verifica conexão e conflitos ao montar o pedido de confirmação.
    const cal = await requireGoogle(ctx).calendar();
    const conflicts = findConflicts(await cal.list(start, end, tz, 20), start, end);
    const guests = input.convidados?.length ? ` com convite para ${input.convidados.join(", ")}` : "";
    const warn = conflicts.length ? ` ATENÇÃO: conflita com ${conflicts.map((c) => `"${c.title}"`).join(", ")}.` : "";
    return `Criar "${input.titulo}" ${humanDateTime(start, tz)} (${input.duracao_minutos} min)${guests}.${warn}`;
  },
  execute: (input, ctx) =>
    guarded(async () => {
      const tz = ctx.profile.timezone;
      const cal = await requireGoogle(ctx).calendar();
      const ev = await cal.create({
        title: input.titulo,
        startLocal: input.inicio,
        endLocal: plusMinutes(input.inicio, input.duracao_minutos, tz),
        timezone: tz,
        location: input.local,
        description: input.descricao,
        attendees: input.convidados,
      });
      return { content: JSON.stringify({ criado: true, id: ev.id, link: ev.link }), summary: `Compromisso criado: ${describeEvent(ev, tz)}` };
    }),
});

export const rescheduleEventTool = defineTool({
  name: "agenda_reagendar_evento",
  label: "Reagendar compromisso",
  description: "Muda o horário de um compromisso existente (id de agenda_consultar). Exige confirmação do usuário no app.",
  input: z.object({ evento_id: z.string().min(3).max(200), novo_inicio: LOCAL_DATETIME, duracao_minutos: z.number().int().min(5).max(24 * 60).optional() }),
  risk: "confirm",
  async describe(input, ctx) {
    const tz = ctx.profile.timezone;
    const ev = await (await requireGoogle(ctx).calendar()).get(input.evento_id, tz);
    const dur = input.duracao_minutos ?? Math.round((ev.endAt.getTime() - ev.startAt.getTime()) / 60_000);
    return `Reagendar "${ev.title}" de ${humanDateTime(ev.startAt, tz)} para ${humanDateTime(localToUtc(input.novo_inicio, tz), tz)} (${dur} min). Convidados serão avisados.`;
  },
  execute: (input, ctx) =>
    guarded(async () => {
      const tz = ctx.profile.timezone;
      const cal = await requireGoogle(ctx).calendar();
      const current = await cal.get(input.evento_id, tz);
      const dur = input.duracao_minutos ?? Math.round((current.endAt.getTime() - current.startAt.getTime()) / 60_000);
      const ev = await cal.reschedule(input.evento_id, input.novo_inicio, plusMinutes(input.novo_inicio, dur, tz), tz);
      return { content: JSON.stringify({ reagendado: true, id: ev.id }), summary: `Reagendado: ${describeEvent(ev, tz)}` };
    }),
});

export const cancelEventTool = defineTool({
  name: "agenda_cancelar_evento",
  label: "Cancelar compromisso",
  description: "Cancela (exclui) um compromisso do Google Agenda. Exige confirmação explícita do usuário no app.",
  input: z.object({ evento_id: z.string().min(3).max(200) }),
  risk: "confirm",
  async describe(input, ctx) {
    const tz = ctx.profile.timezone;
    const ev = await (await requireGoogle(ctx).calendar()).get(input.evento_id, tz);
    return `Cancelar o compromisso "${ev.title}" (${humanDateTime(ev.startAt, tz)}). Convidados serão avisados.`;
  },
  execute: (input, ctx) =>
    guarded(async () => {
      await (await requireGoogle(ctx).calendar()).remove(input.evento_id);
      return { content: "Compromisso cancelado.", summary: "Compromisso cancelado na agenda" };
    }),
});

// ---------------------------------------------------------------------------
// Gmail
// ---------------------------------------------------------------------------
export const searchEmailTool = defineTool({
  name: "email_buscar",
  label: "E-mails consultados",
  description:
    "Busca e-mails no Gmail usando a sintaxe de busca do Gmail (ex.: 'is:unread is:important newer_than:2d', " +
    "'from:fornecedor@x.com', 'subject:pedido'). Retorna remetente, assunto, data, trecho e id.",
  input: z.object({ consulta: z.string().max(300).default("is:unread newer_than:2d"), maximo: z.number().int().min(1).max(20).default(10) }),
  risk: "read",
  execute: (input, ctx) =>
    guarded(async () => {
      const mails = await (await requireGoogle(ctx).gmail()).search(input.consulta, input.maximo);
      if (mails.length === 0) return { content: "Nenhum e-mail encontrado.", summary: "Nenhum e-mail encontrado" };
      const text = mails
        .map((m) => `- [id=${m.id}]${m.unread ? " [NÃO LIDO]" : ""}${m.important ? " [IMPORTANTE]" : ""} De: ${m.from} | Assunto: ${m.subject} | ${m.date}\n  ${m.snippet}`)
        .join("\n");
      return { content: wrapUntrusted("gmail", text), summary: `${mails.length} e-mail(s) encontrados` };
    }),
});

export const readEmailTool = defineTool({
  name: "email_ler",
  label: "E-mail lido",
  description: "Lê o conteúdo de um e-mail (id de email_buscar) para resumir ou localizar informações.",
  input: z.object({ id: z.string().min(5).max(100) }),
  risk: "read",
  execute: (input, ctx) =>
    guarded(async () => {
      const m = await (await requireGoogle(ctx).gmail()).read(input.id);
      const text = `De: ${m.from}\nPara: ${m.to}\nAssunto: ${m.subject}\nData: ${m.date}\n\n${m.body}`;
      return { content: wrapUntrusted("gmail", text), summary: `Leu: "${m.subject.slice(0, 60)}"` };
    }),
});

const emailInput = z.object({
  para: z.array(EMAIL).min(1).max(10),
  assunto: z.string().trim().min(1).max(200),
  corpo: z.string().trim().min(1).max(10_000),
  responder_a_id: z.string().max(100).optional().describe("id do e-mail sendo respondido (mantém a conversa)"),
});

async function prepareEmail(input: z.infer<typeof emailInput>, ctx: ToolContext) {
  const gmail = await requireGoogle(ctx).gmail();
  let threadId: string | undefined;
  let inReplyTo: string | null = null;
  let references: string | null = null;
  let subject = input.assunto;
  if (input.responder_a_id) {
    const orig = await gmail.read(input.responder_a_id, 200);
    threadId = orig.threadId;
    inReplyTo = orig.messageId;
    references = orig.references;
    if (!/^re:/i.test(subject)) subject = `Re: ${subject}`;
  }
  return { gmail, threadId, raw: buildRawEmail({ to: input.para, subject, body: input.corpo, inReplyTo, references }), subject };
}

export const draftEmailTool = defineTool({
  name: "email_criar_rascunho",
  label: "Rascunho criado",
  description: "Cria um RASCUNHO no Gmail (não envia). Use para preparar respostas que o usuário vai revisar.",
  input: emailInput,
  risk: "write",
  execute: (input, ctx) =>
    guarded(async () => {
      const { gmail, raw, threadId, subject } = await prepareEmail(input, ctx);
      const d = await gmail.createDraft(raw, threadId);
      return { content: JSON.stringify({ rascunho_criado: true, id: d.id }), summary: `Rascunho salvo no Gmail: "${subject}" para ${input.para.join(", ")}` };
    }),
});

export const sendEmailTool = defineTool({
  name: "email_enviar",
  label: "Enviar e-mail",
  description:
    "Envia um e-mail pelo Gmail do usuário. NUNCA é enviado sem o usuário confirmar no app. " +
    "Mostre ao usuário destinatário, assunto e texto antes.",
  input: emailInput,
  risk: "confirm",
  async describe(input, ctx) {
    await requireGoogle(ctx).gmail(); // falha cedo se o Gmail não estiver conectado
    const preview = input.corpo.length > 280 ? `${input.corpo.slice(0, 277)}…` : input.corpo;
    return `Enviar e-mail para ${input.para.join(", ")} — assunto "${input.assunto}":\n"${preview}"`;
  },
  execute: (input, ctx) =>
    guarded(async () => {
      const { gmail, raw, threadId, subject } = await prepareEmail(input, ctx);
      const sent = await gmail.send(raw, threadId);
      return { content: JSON.stringify({ enviado: true, id: sent.id }), summary: `E-mail enviado para ${input.para.join(", ")}: "${subject}"` };
    }),
});

// ---------------------------------------------------------------------------
// Tarefas e lembretes (armazenadas no Jarvis)
// ---------------------------------------------------------------------------
function taskLine(t: Task, tz: string) {
  const due = t.dueDate ? ` | prazo ${t.dueDate}` : "";
  const rem = t.remindAt ? ` | lembrete ${humanDateTime(new Date(t.remindAt), tz)}` : "";
  return `- [id=${t.id}] (${t.priority}, ${t.space}${t.status === "concluida" ? ", CONCLUÍDA" : ""}) ${t.title}${due}${rem}`;
}

export const createTaskTool = defineTool({
  name: "tarefa_criar",
  label: "Tarefa criada",
  description: "Cria uma tarefa no Jarvis, com prazo e/ou lembrete opcional (o lembrete chega como notificação no iPhone).",
  input: z.object({
    titulo: z.string().trim().min(1).max(300),
    notas: z.string().max(2000).optional(),
    prazo: LOCAL_DATE.optional(),
    lembrete: LOCAL_DATETIME.optional().describe("Quando notificar (horário local)"),
    prioridade: TaskPrioritySchema.default("normal"),
    espaco: SpaceSchema.default("pessoal"),
  }),
  risk: "write",
  async execute(input, ctx) {
    const tz = ctx.profile.timezone;
    let remindAt: string | undefined;
    if (input.lembrete) {
      const at = localToUtc(input.lembrete, tz);
      if (at.getTime() < ctx.now.getTime() - 60_000) {
        return { content: "O horário do lembrete já passou. Pergunte um novo horário.", summary: "Lembrete no passado — não criado", isError: true };
      }
      remindAt = at.toISOString();
    }
    const t = await ctx.store.createTask({
      title: input.titulo,
      notes: input.notas,
      dueDate: input.prazo,
      remindAt,
      priority: input.prioridade,
      space: input.espaco,
    });
    const rem = t.remindAt ? ` — lembrete ${humanDateTime(new Date(t.remindAt), tz)}` : "";
    return { content: JSON.stringify({ criada: true, id: t.id }), summary: `Tarefa criada: "${t.title}"${t.dueDate ? ` (prazo ${t.dueDate})` : ""}${rem}` };
  },
});

export const listTasksTool = defineTool({
  name: "tarefa_listar",
  label: "Tarefas consultadas",
  description: "Lista tarefas do usuário (abertas por padrão), opcionalmente só as que vencem até uma data.",
  input: z.object({ status: z.enum(["aberta", "concluida", "todas"]).default("aberta"), ate: LOCAL_DATE.optional(), espaco: SpaceSchema.optional() }),
  risk: "read",
  async execute(input, ctx) {
    let tasks = await ctx.store.listTasks({ status: input.status, dueOnOrBefore: input.ate, limit: 50 });
    if (input.espaco) tasks = tasks.filter((t) => t.space === input.espaco);
    if (tasks.length === 0) return { content: "Nenhuma tarefa encontrada.", summary: "Nenhuma tarefa" };
    const today = localDate(ctx.now, ctx.profile.timezone);
    const overdue = tasks.filter((t) => t.status === "aberta" && t.dueDate && t.dueDate < today).length;
    return {
      content: `Hoje é ${today}.\n${tasks.map((t) => taskLine(t, ctx.profile.timezone)).join("\n")}`,
      summary: `${tasks.length} tarefa(s)${overdue ? `, ${overdue} atrasada(s)` : ""}`,
    };
  },
});

export const completeTaskTool = defineTool({
  name: "tarefa_concluir",
  label: "Tarefa concluída",
  description: "Marca uma tarefa como concluída (id de tarefa_listar).",
  input: z.object({ id: z.string().uuid() }),
  risk: "write",
  async execute(input, ctx) {
    const t = await ctx.store.updateTask(input.id, { status: "concluida" });
    if (!t) return { content: "Tarefa não encontrada.", summary: "Tarefa não encontrada", isError: true };
    return { content: "Tarefa concluída.", summary: `Concluída: "${t.title}"` };
  },
});

export const deleteTaskTool = defineTool({
  name: "tarefa_apagar",
  label: "Apagar tarefa",
  description: "Apaga uma tarefa. Exige confirmação do usuário no app.",
  input: z.object({ id: z.string().uuid() }),
  risk: "confirm",
  async describe(input, ctx) {
    const t = await ctx.store.getTask(input.id);
    return t ? `Apagar a tarefa "${t.title}"` : `Apagar a tarefa ${input.id}`;
  },
  async execute(input, ctx) {
    const ok = await ctx.store.deleteTask(input.id);
    return ok ? { content: "Tarefa apagada.", summary: "Tarefa apagada" } : { content: "Tarefa não encontrada.", summary: "Tarefa não encontrada", isError: true };
  },
});

// ---------------------------------------------------------------------------
// Resumo do dia
// ---------------------------------------------------------------------------
export const daySummaryTool = defineTool({
  name: "resumo_do_dia",
  label: "Resumo do dia",
  description: "Reúne compromissos, tarefas e e-mails importantes de um dia (padrão: hoje). Use para 'o que temos para hoje?'.",
  input: z.object({ data: LOCAL_DATE.optional() }),
  risk: "read",
  async execute(input, ctx) {
    const tz = ctx.profile.timezone;
    const date = input.data ?? localDate(ctx.now, tz);
    const tasks = await ctx.store.listTasks({ status: "aberta", dueOnOrBefore: date, limit: 30 });
    const day = await buildDay(ctx.google, tasks, date, tz);
    const detail = [
      `Data: ${date}`,
      day.calendar.connected
        ? day.calendar.error
          ? `Agenda: erro (${day.calendar.error})`
          : `Agenda:\n${day.calendar.events.map((e) => `- ${e.allDay ? "dia inteiro" : `${e.start.slice(11)}–${e.end.slice(11)}`} ${e.title}`).join("\n") || "- nada"}`
        : "Agenda: NÃO CONECTADA",
      `Tarefas abertas (prazo até ${date} ou sem prazo):\n${tasks.map((t) => taskLine(t, tz)).join("\n") || "- nenhuma"}`,
      day.email.connected ? `E-mails importantes não lidos (7 dias): ${day.email.importantUnread ?? "erro"}` : "Gmail: NÃO CONECTADO",
      `Sugestão de fala: ${summaryText(day, ctx.profile.ownerName, tz, "Certo")}`,
    ].join("\n");
    return { content: wrapUntrusted("resumo", detail), summary: `Resumo de ${date}: ${day.calendar.events.length} compromisso(s), ${tasks.length} tarefa(s)` };
  },
});

export const PRODUCTIVITY_TOOLS = [
  listEventsTool,
  availabilityTool,
  createEventTool,
  rescheduleEventTool,
  cancelEventTool,
  searchEmailTool,
  readEmailTool,
  draftEmailTool,
  sendEmailTool,
  createTaskTool,
  listTasksTool,
  completeTaskTool,
  deleteTaskTool,
  daySummaryTool,
];
