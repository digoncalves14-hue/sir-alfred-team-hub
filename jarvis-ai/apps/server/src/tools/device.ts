/**
 * Ferramentas executadas no PRÓPRIO iPhone (Fase 3), sempre após confirmação:
 *  - lembrete no app Lembretes (EventKit)
 *  - evento no Calendário do iPhone (EventKit)
 *  - abrir ligação, SMS, WhatsApp (link oficial wa.me), e-mail, Mapas ou um link
 *
 * Contatos e agenda do iPhone ficam no aparelho: a busca do contato pelo nome
 * acontece no iPhone, no momento da execução. Nada é enviado sozinho — o app de
 * destino abre com a mensagem pronta e o usuário toca em enviar/ligar.
 */
import { z } from "zod";
import { COMMUNICATION_CHANNELS } from "@jarvis/shared";
import { humanDateTime, localToUtc } from "../agent/time";
import { defineTool } from "./registry";

const LOCAL_DATETIME = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use AAAA-MM-DDTHH:MM no fuso do usuário");

const notImplementedOnServer = async () => ({
  content: "Esta ação é executada no iPhone após a confirmação do usuário.",
  summary: "Executada no iPhone",
  isError: true,
});

export const iphoneReminderTool = defineTool({
  name: "iphone_criar_lembrete",
  label: "Lembrete no iPhone",
  description:
    "Cria um lembrete no app Lembretes do iPhone (sincroniza com o iCloud). Use quando o usuário pedir explicitamente " +
    "'no iPhone' / 'nos Lembretes'. Para lembretes comuns do Jarvis, prefira tarefa_criar. Exige confirmação no app.",
  input: z.object({ titulo: z.string().trim().min(1).max(300), data_hora: LOCAL_DATETIME.optional(), notas: z.string().max(2000).optional() }),
  risk: "confirm",
  describe: (i, ctx) =>
    `Criar no app Lembretes do iPhone: "${i.titulo}"${i.data_hora ? ` — ${humanDateTime(localToUtc(i.data_hora, ctx.profile.timezone), ctx.profile.timezone)}` : ""}.`,
  deviceAction: (i) => ({ kind: "lembrete_iphone", input: { titulo: i.titulo, dataHora: i.data_hora, notas: i.notas } }),
  execute: notImplementedOnServer,
});

export const iphoneEventTool = defineTool({
  name: "iphone_criar_evento",
  label: "Evento no iPhone",
  description:
    "Cria um evento no Calendário do iPhone (agenda padrão do aparelho, ex.: iCloud). Use quando o usuário pedir " +
    "'no calendário do iPhone' ou quando o Google Agenda não estiver conectado. Exige confirmação no app.",
  input: z.object({
    titulo: z.string().trim().min(1).max(200),
    inicio: LOCAL_DATETIME,
    duracao_minutos: z.number().int().min(5).max(1440).default(60),
    local: z.string().max(200).optional(),
  }),
  risk: "confirm",
  describe: (i, ctx) =>
    `Criar no Calendário do iPhone: "${i.titulo}" ${humanDateTime(localToUtc(i.inicio, ctx.profile.timezone), ctx.profile.timezone)} (${i.duracao_minutos} min).`,
  deviceAction: (i) => ({ kind: "evento_iphone", input: { titulo: i.titulo, inicio: i.inicio, duracaoMin: i.duracao_minutos, local: i.local } }),
  execute: notImplementedOnServer,
});

const CANAL_LABEL: Record<(typeof COMMUNICATION_CHANNELS)[number], string> = {
  ligacao: "Ligar para",
  sms: "Abrir mensagem (SMS) para",
  whatsapp: "Abrir o WhatsApp com",
  email: "Abrir e-mail para",
  mapa: "Abrir o Mapas em",
  link: "Abrir o link",
};

export const communicationTool = defineTool({
  name: "abrir_comunicacao",
  label: "Abrir no iPhone",
  description:
    "Abre no iPhone uma ligação, SMS, conversa do WhatsApp (link oficial, com a mensagem pronta), e-mail, rota no Mapas ou um link. " +
    "Para pessoas, informe 'contato' com o nome como está na agenda do iPhone (a busca é feita no aparelho) ou 'destino' com o número/e-mail. " +
    "O usuário confirma no app e ainda toca em enviar/ligar no app de destino. Não envia nada sozinho.",
  input: z
    .object({
      canal: z.enum(COMMUNICATION_CHANNELS),
      contato: z.string().trim().min(1).max(100).optional(),
      destino: z.string().trim().min(1).max(500).optional(),
      mensagem: z.string().max(2000).optional(),
      assunto: z.string().max(200).optional(),
    })
    .refine((i) => i.contato || i.destino, { message: "Informe 'contato' ou 'destino'." })
    .refine((i) => !["mapa", "link"].includes(i.canal) || i.destino, { message: "Para mapa e link, informe 'destino'." })
    .refine((i) => i.canal !== "link" || /^https:\/\//i.test(i.destino ?? ""), { message: "Somente links https:// são permitidos." }),
  risk: "confirm",
  describe: (i) => {
    const who = i.contato ?? i.destino ?? "";
    const msg = i.mensagem ? ` com a mensagem: "${i.mensagem.length > 200 ? `${i.mensagem.slice(0, 197)}…` : i.mensagem}"` : "";
    const tail = i.canal === "ligacao" ? "" : i.canal === "mapa" || i.canal === "link" ? "" : " (você ainda toca em Enviar)";
    return `${CANAL_LABEL[i.canal]} ${who}${msg}${tail}.`;
  },
  deviceAction: (i) => ({ kind: "comunicacao", input: { canal: i.canal, contato: i.contato, destino: i.destino, mensagem: i.mensagem, assunto: i.assunto } }),
  execute: notImplementedOnServer,
});

export const DEVICE_TOOLS = [iphoneReminderTool, iphoneEventTool, communicationTool];
