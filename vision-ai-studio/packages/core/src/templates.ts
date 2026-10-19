import { z } from "zod";
import { CAPTION_STYLE_IDS } from "./caption-styles";
import type { EditOperation } from "./edit-plan";
import { FORMAT_PRESET_IDS } from "./presets";
import { EDIT_STYLE_IDS } from "./styles";
import { clipsDuration, type Timeline } from "./timeline";

/**
 * Templates inteligentes: um conjunto de decisões de edição que vira operações
 * do motor determinístico (sempre aplicáveis) + uma orientação textual para a IA
 * (usada somente quando há provedor de IA, para estruturar a narrativa).
 */
export const TemplateConfig = z.object({
  styleId: z.enum(EDIT_STYLE_IDS),
  preset: z.enum(FORMAT_PRESET_IDS).nullable(),
  reframe: z.enum(["fill", "fit_blur", "fit"]).nullable(),
  targetDurationSec: z.number().min(5).max(600).nullable(),
  strategy: z.enum(["best_moments", "beginning", "speech_focused"]).default("best_moments"),
  removeSilences: z.boolean(),
  captions: z.object({
    enabled: z.boolean(),
    style: z.enum(CAPTION_STYLE_IDS).nullable(),
    position: z.enum(["bottom", "center", "top"]).nullable(),
  }),
  logo: z.enum(["none", "end_card", "watermark", "both"]),
  endCardSec: z.number().min(1).max(10).default(3),
  musicVolume: z.number().min(0).max(1).nullable(),
  syncToBeat: z.boolean().default(false),
  aiGuidance: z.string().max(1000).default(""),
});
export type TemplateConfig = z.infer<typeof TemplateConfig>;

export interface TemplateDef {
  id: string;
  name: string;
  category: string;
  description: string;
  config: TemplateConfig;
  isSystem: boolean;
}

const base = (c: Partial<TemplateConfig> & Pick<TemplateConfig, "styleId">): TemplateConfig =>
  TemplateConfig.parse({
    preset: "instagram_reels_9x16",
    reframe: null,
    targetDurationSec: 30,
    removeSilences: true,
    captions: { enabled: true, style: null, position: null },
    logo: "end_card",
    musicVolume: null,
    ...c,
  });

export const SYSTEM_TEMPLATES: TemplateDef[] = [
  { id: "sys:antes-depois", name: "Antes e depois", category: "Barbearia", description: "Mostra o visual inicial, acelera o processo e revela o resultado final.", isSystem: true,
    config: base({ styleId: "premium", targetDurationSec: 20, captions: { enabled: false, style: null, position: null }, aiGuidance: "Abra com o 'antes' (cliente antes do corte), mantenha poucos trechos curtos do processo e termine com o 'depois' em destaque por mais tempo." }) },
  { id: "sys:transformacao", name: "Transformação de cabelo", category: "Barbearia", description: "Ritmo dinâmico com as etapas do corte e final revelador.", isSystem: true,
    config: base({ styleId: "reels_dynamic", targetDurationSec: 30, syncToBeat: true, aiGuidance: "Priorize etapas visuais do corte (máquina, tesoura, acabamento) e termine no resultado." }) },
  { id: "sys:cosmeticos", name: "Demonstração de cosméticos", category: "Produto", description: "Produto em destaque, aplicação e benefício.", isSystem: true,
    config: base({ styleId: "product_commercial", targetDurationSec: 30, captions: { enabled: true, style: "commercial", position: null }, aiGuidance: "Mostre o produto logo no início, depois a aplicação e o resultado. Evite trechos sem o produto." }) },
  { id: "sys:propaganda-barbearia", name: "Propaganda de barbearia", category: "Barbearia", description: "Ambiente, serviço e chamada para agendar.", isSystem: true,
    config: base({ styleId: "premium", targetDurationSec: 30, logo: "both", aiGuidance: "Mostre o ambiente, o atendimento e o resultado; finalize com chamada para agendamento." }) },
  { id: "sys:depoimento", name: "Depoimento de cliente", category: "Conteúdo", description: "Fala do cliente com legendas e frases completas.", isSystem: true,
    config: base({ styleId: "interview_podcast", targetDurationSec: 45, strategy: "speech_focused", captions: { enabled: true, style: "highlight_word", position: null }, aiGuidance: "Mantenha as frases mais fortes do cliente, completas, sem cortar no meio." }) },
  { id: "sys:educacional", name: "Conteúdo educacional", category: "Educação", description: "Explicação clara com legenda de fundo e ritmo calmo.", isSystem: true,
    config: base({ styleId: "educational", preset: "youtube_shorts_9x16", targetDurationSec: 60, strategy: "speech_focused", aiGuidance: "Preserve a sequência lógica da explicação; comece pelo problema e termine com a dica principal." }) },
  { id: "sys:workshop", name: "Workshop", category: "Educação", description: "Melhor trecho explicativo de uma aula ou workshop.", isSystem: true,
    config: base({ styleId: "workshop_training", preset: "youtube_16x9", targetDurationSec: 90, strategy: "speech_focused", logo: "watermark", aiGuidance: "Escolha um trecho que explique uma técnica do começo ao fim." }) },
  { id: "sys:entrevista", name: "Entrevista", category: "Conteúdo", description: "Perguntas e respostas com legendas destacadas.", isSystem: true,
    config: base({ styleId: "interview_podcast", preset: "youtube_16x9", targetDurationSec: 60, strategy: "speech_focused", captions: { enabled: true, style: "highlight_word", position: null }, logo: "watermark", aiGuidance: "Inclua a pergunta e a resposta completas; priorize respostas com opinião forte." }) },
  { id: "sys:lancamento", name: "Lançamento de produto", category: "Produto", description: "Teaser curto, impactante e com logo.", isSystem: true,
    config: base({ styleId: "product_commercial", targetDurationSec: 15, syncToBeat: true, captions: { enabled: false, style: null, position: null }, logo: "end_card", aiGuidance: "Construa expectativa: detalhes do produto primeiro, produto inteiro só no final." }) },
  { id: "sys:infantil-musical", name: "Vídeo musical infantil", category: "Infantil", description: "Ritmo alegre, cortes na batida e legenda colorida.", isSystem: true,
    config: base({ styleId: "kids_fun", targetDurationSec: 45, syncToBeat: true, captions: { enabled: true, style: "kids_colorful", position: null }, musicVolume: 0.5, aiGuidance: "Mantenha momentos alegres e de movimento; evite trechos parados." }) },
  { id: "sys:software", name: "Publicidade de software", category: "Tecnologia", description: "Funcionalidade, benefício e chamada para ação.", isSystem: true,
    config: base({ styleId: "educational", preset: "youtube_16x9", reframe: "fit_blur", targetDurationSec: 45, aiGuidance: "Mostre a tela com a funcionalidade em uso; termine com o benefício e a chamada para conhecer o sistema." }) },
];

/** Converte o template em operações do motor (na ordem certa: formato → cortes → acabamento). */
export function templateToOperations(t: TemplateConfig, opts: { hasMusic: boolean; hasTranscript: boolean; hasLogo: boolean }): EditOperation[] {
  const ops: EditOperation[] = [{ op: "set_style", style_id: t.styleId }];
  if (t.preset) ops.push({ op: "set_format", preset: t.preset });
  if (t.reframe) ops.push({ op: "set_reframe", mode: t.reframe });
  if (t.removeSilences) ops.push({ op: "remove_silences", min_silence_sec: 0.7, padding_sec: 0.15 });
  if (t.targetDurationSec) ops.push({ op: "target_duration", seconds: t.targetDurationSec, strategy: t.strategy });
  if (t.captions.enabled && opts.hasTranscript) ops.push({ op: "set_captions", enabled: true, style: t.captions.style, position: t.captions.position });
  if (!t.captions.enabled) ops.push({ op: "set_captions", enabled: false, style: null, position: null });
  if (opts.hasLogo && (t.logo === "end_card" || t.logo === "both")) ops.push({ op: "add_logo", placement: "end_card", duration_sec: t.endCardSec });
  if (opts.hasLogo && (t.logo === "watermark" || t.logo === "both")) ops.push({ op: "add_logo", placement: "watermark", duration_sec: null });
  if (opts.hasMusic) {
    ops.push({ op: "set_music", action: "add", asset_id: null, volume: t.musicVolume, ducking: true });
    if (t.syncToBeat) ops.push({ op: "sync_to_beat", max_shift_sec: 0.35 });
  }
  return ops;
}

/** Cria um template a partir das decisões da versão atual de um projeto. */
export function templateFromTimeline(tl: Timeline): TemplateConfig {
  const card = tl.logos.find((l) => l.mode === "end_card");
  const wm = tl.logos.find((l) => l.mode === "watermark");
  return TemplateConfig.parse({
    styleId: (EDIT_STYLE_IDS as readonly string[]).includes(tl.styleId ?? "") ? tl.styleId : "premium",
    preset: tl.format.preset,
    reframe: tl.format.reframe,
    targetDurationSec: Math.max(5, Math.min(600, Math.round(clipsDuration(tl)))),
    removeSilences: false,
    captions: { enabled: tl.captions.enabled, style: tl.captions.style, position: tl.captions.position },
    logo: card && wm ? "both" : card ? "end_card" : wm ? "watermark" : "none",
    endCardSec: card?.durationSec ?? 3,
    musicVolume: tl.audio.music?.volume ?? null,
  });
}
