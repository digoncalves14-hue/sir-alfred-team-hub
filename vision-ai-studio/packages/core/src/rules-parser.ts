import type { EditOperation, EditPlan } from "./edit-plan";
import type { FormatPresetId } from "./presets";

/**
 * Interpretador LOCAL de comandos (sem IA). Usado quando nenhum provedor de
 * modelo de linguagem está configurado, ou como fallback em caso de falha.
 * Reconhece um conjunto fechado de pedidos comuns em português e responde
 * honestamente quando não entende. A interface identifica quando ele foi usado.
 */

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60,
  setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100,
};

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[“”"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Substitui números por extenso simples ("trinta e cinco") por dígitos. */
export function wordsToDigits(s: string): string {
  return s
    .replace(/\bmeio minuto\b/g, "30 segundos")
    .replace(/\b(\p{L}+)(?: e (\p{L}+))?\b/gu, (m, a: string, b?: string) => {
      const x = NUMBER_WORDS[a];
      if (x === undefined) return m;
      const y = b ? NUMBER_WORDS[b] : undefined;
      if (b && y !== undefined && y < 10 && x >= 20) return String(x + y);
      return b ? `${x} e ${b}` : String(x);
    });
}

function seconds(value: string, unit: string): number {
  const v = Number(value.replace(",", "."));
  return /^min/.test(unit) ? v * 60 : v;
}

const SEC = "(segundos?|seg|s|minutos?|min)\\b";

export function parseCommandLocally(input: string): EditPlan {
  const raw = input.slice(0, 2000);
  const t = wordsToDigits(normalizeText(raw));
  const ops: EditOperation[] = [];
  const said: string[] = [];

  const negCaptions = /\b(sem|tire|tira|remova|remove|retire|desative|desligue)\b[^.]{0,20}\blegenda/.test(t);
  const negMusic = /\b(sem|tire|tira|remova|remove|retire)\b[^.]{0,20}\bmusica/.test(t);
  const negLogo = /\b(sem|tire|tira|remova|remove|retire)\b[^.]{0,20}\b(logo|logotipo|logomarca)/.test(t);

  // estilo
  const styleMap: Array<[RegExp, EditOperation & { op: "set_style" }]> = [
    [/cinematografic/, { op: "set_style", style_id: "cinematic" }],
    [/\b(infantil|criancas?|kids)\b/, { op: "set_style", style_id: "kids_fun" }],
    [/\b(entrevista|podcast)\b/, { op: "set_style", style_id: "interview_podcast" }],
    [/\b(workshop|treinamento)\b/, { op: "set_style", style_id: "workshop_training" }],
    [/\b(educacional|educativo|aula)\b/, { op: "set_style", style_id: "educational" }],
    [/\b(comercial|propaganda|anuncio) de produto|\bproduto\b/, { op: "set_style", style_id: "product_commercial" }],
    [/\bmais dinamic|\bdinamic/, { op: "set_style", style_id: "reels_dynamic" }],
    [/\b(elegante|premium|sofisticad)/, { op: "set_style", style_id: "premium" }],
  ];
  const styleHit = styleMap.find(([re]) => re.test(t) && !/legenda (dinamica|elegante|premium)/.test(t));
  if (styleHit) {
    ops.push(styleHit[1]);
    said.push("aplicar o estilo pedido");
  }

  // formato
  let preset: FormatPresetId | null = null;
  if (/\bshorts?\b/.test(t)) preset = "youtube_shorts_9x16";
  else if (/\bstor(y|ies)\b/.test(t)) preset = "instagram_stories_9x16";
  else if (/facebook/.test(t) && /\breels?\b/.test(t)) preset = "facebook_reels_9x16";
  else if (/\breels?\b|\bvertical\b|9 ?[:x/] ?16|\btiktok\b/.test(t)) preset = "instagram_reels_9x16";
  else if (/\bquadrad|1 ?[:x/] ?1\b/.test(t)) preset = /facebook/.test(t) ? "facebook_feed_1x1" : "instagram_feed_1x1";
  else if (/4 ?[:x/] ?5|\bfeed\b/.test(t)) preset = /facebook/.test(t) ? "facebook_feed_4x5" : "instagram_feed_4x5";
  else if (/\bhorizontal\b|16 ?[:x/] ?9|\byoutube\b/.test(t)) preset = "youtube_16x9";
  if (preset) {
    ops.push({ op: "set_format", preset });
    said.push("ajustar o formato");
  }
  if (/fundo desfocado|sem cortar|video inteiro/.test(t)) ops.push({ op: "set_reframe", mode: "fit_blur" });

  // cortes por tempo
  const first = t.match(new RegExp(`(?:primeiros?|inicio|comeco)[^0-9]{0,15}(\\d+(?:[.,]\\d+)?)\\s*${SEC}`));
  const firstAlt = t.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${SEC}[^.]{0,12}(?:iniciais|do inicio|do comeco)`));
  if (first || firstAlt) {
    const m = (first ?? firstAlt)!;
    ops.push({ op: "trim_start", seconds: seconds(m[1], m[2]) });
    said.push("cortar o início");
  }
  const last = t.match(new RegExp(`(?:ultimos?|final)[^0-9]{0,15}(\\d+(?:[.,]\\d+)?)\\s*${SEC}`));
  const lastAlt = t.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${SEC}[^.]{0,12}(?:finais|do final|do fim)`));
  if ((last || lastAlt) && !/logo/.test(t.slice(Math.max(0, t.indexOf("final") - 15), t.indexOf("final") + 25))) {
    const m = (last ?? lastAlt)!;
    ops.push({ op: "trim_end", seconds: seconds(m[1], m[2]) });
    said.push("cortar o final");
  }
  const range = t.match(/(?:de|do segundo|entre)\s*(\d+(?:[.,]\d+)?)\s*(?:s|segundos?)?\s*(?:a|ao|e|ate)\s*(\d+(?:[.,]\d+)?)\s*(?:s|segundos?)\b/);
  if (range) {
    const a = Number(range[1].replace(",", "."));
    const b = Number(range[2].replace(",", "."));
    if (/\b(remova|remove|tire|tira|retire|corte|apague|exclua)\b/.test(t)) ops.push({ op: "remove_range", start: a, end: b });
    else ops.push({ op: "keep_range", start: a, end: b });
    said.push("ajustar o trecho indicado");
  }

  // silêncios / momentos parados
  if (/silencio|pausas?|respiros?|\bvacuos?\b/.test(t)) {
    ops.push({ op: "remove_silences", min_silence_sec: styleHit?.[1].style_id === "reels_dynamic" ? 0.5 : 0.7, padding_sec: 0.15 });
    said.push("remover silêncios");
  }
  if (/nao acontece nada|parad[oa]s?\b|sem movimento|enrolacao/.test(t)) {
    ops.push({ op: "remove_static", min_duration_sec: 2 });
    if (!ops.some((o) => o.op === "remove_silences")) ops.push({ op: "remove_silences", min_silence_sec: 1, padding_sec: 0.2 });
    said.push("remover momentos sem ação");
  }
  if (styleHit?.[1].style_id === "reels_dynamic" && !ops.some((o) => o.op === "remove_silences")) {
    ops.push({ op: "remove_silences", min_silence_sec: 0.5, padding_sec: 0.1 });
  }

  // duração alvo
  const dur =
    t.match(new RegExp(`(?:versao|video|reels?|shorts?|corte|clipe|edicao|resumo|teaser)[^.]{0,25}?(?:de|com)\\s*(\\d+(?:[.,]\\d+)?)\\s*${SEC}`)) ??
    t.match(new RegExp(`(?:deixe|deixa|reduza|reduz|encurte|limite|transforme)[^.]{0,30}?(?:em|para|com|a)\\s*(\\d+(?:[.,]\\d+)?)\\s*${SEC}`)) ??
    t.match(new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*${SEC}\\s*de (?:duracao|video)`));
  if (dur && !first && !last) {
    const strategy = /mantenha o (comeco|inicio)|so o (comeco|inicio)/.test(t)
      ? "beginning"
      : /\bfalas?\b|conversa/.test(t)
        ? "speech_focused"
        : "best_moments";
    ops.push({ op: "target_duration", seconds: seconds(dur[1], dur[2]), strategy });
    said.push(`montar uma versão de ${seconds(dur[1], dur[2])}s`);
  }

  // legendas
  if (/legenda/.test(t)) {
    if (negCaptions) {
      ops.push({ op: "set_captions", enabled: false, style: null, position: null });
      said.push("desativar as legendas");
    } else {
      const style =
        /destac|karaoke/.test(t) ? "highlight_word"
        : /legendas? dinamic|grandes?/.test(t) ? "dynamic"
        : /colorid|infantil/.test(t) ? "kids_colorful"
        : /educa/.test(t) ? "educational"
        : /comercial/.test(t) ? "commercial"
        : /minimal|elegante|premium|discreta/.test(t) ? "premium_minimal"
        : null;
      const position = /legendas? (no|em) (topo|cima)|no topo/.test(t) ? "top" : /centro|meio da tela/.test(t) ? "center" : null;
      ops.push({ op: "set_captions", enabled: true, style, position });
      said.push("adicionar legendas automáticas");
    }
  }

  // logo
  if (/\b(logo|logotipo|logomarca|marca d.?agua)\b/.test(t)) {
    if (negLogo) {
      ops.push({ op: "remove_logo", placement: "all" });
      said.push("remover a logo");
    } else {
      const watermark = /canto|marca d.?agua|durante/.test(t);
      ops.push({ op: "add_logo", placement: watermark ? "watermark" : "end_card", duration_sec: null });
      said.push(watermark ? "colocar a logo no canto" : "finalizar com a logo");
    }
  }

  // música
  if (/musica|trilha/.test(t)) {
    if (negMusic) ops.push({ op: "set_music", action: "remove", asset_id: null, volume: null, ducking: null });
    else if (/musica mais (baixa|baixo)|abaixe a musica|diminua a musica/.test(t)) ops.push({ op: "set_music", action: "adjust", asset_id: null, volume: 0.12, ducking: null });
    else if (/musica mais (alta|alto)|aumente a musica/.test(t)) ops.push({ op: "set_music", action: "adjust", asset_id: null, volume: 0.45, ducking: null });
    else {
      ops.push({ op: "set_music", action: "add", asset_id: null, volume: null, ducking: true });
      if (/emocion|epic|elegante|alegre|energetic|divertid|calma/.test(t)) {
        ops.push({
          op: "unsupported",
          request: "escolher música por clima",
          reason: "A escolha automática de trilha por estilo depende de uma biblioteca de músicas licenciadas, que ainda não está integrada. Usei a música enviada para o projeto/marca.",
        });
      }
    }
    said.push("ajustar a música");
  }

  if (/sincroniz|na batida|no ritmo da musica|ritmo da musica|com a batida/.test(t)) {
    ops.push({ op: "sync_to_beat", max_shift_sec: 0.35 });
    said.push("sincronizar os cortes com a batida da música");
  }

  // áudio
  if (/normaliz|volume (igual|uniforme)/.test(t)) ops.push({ op: "set_audio", original_volume: null, normalize: true, denoise: null });
  if (/ruido|chiado|barulho/.test(t)) {
    ops.push({ op: "set_audio", original_volume: null, normalize: null, denoise: true });
    said.push("reduzir ruído");
  }

  // pedidos que esta versão não executa — resposta honesta
  if (/\bzoom\b|aproxim|close/.test(t)) {
    if (range) {
      // zoom com tempos explícitos: executável sem análise visual
      const i = ops.findIndex((o) => o.op === "keep_range" || o.op === "remove_range");
      if (i >= 0 && ops[i].op === "keep_range") ops.splice(i, 1);
      ops.push({ op: "zoom_range", start: Number(range[1].replace(",", ".")), end: Number(range[2].replace(",", ".")), zoom: 1.35, focus_x: null, focus_y: null });
      said.push("aproximar a câmera no trecho indicado");
    } else {
      ops.push({
        op: "unsupported",
        request: "aproximar a câmera em momentos específicos",
        reason: "Sem um provedor de IA multimodal configurado, não consigo identificar o momento pela imagem. Indique o trecho (ex.: \"aproxime de 12 a 18 segundos\") ou configure a IA para análise visual por amostragem de quadros.",
      });
    }
  }
  if (/transic|efeito|filtro de cor/.test(t)) {
    ops.push({ op: "unsupported", request: "transições e efeitos", reason: "Transições e efeitos visuais estão previstos para a Fase 3 e ainda não são renderizados." });
  }
  if (/narrac|locucao|voz (masculina|feminina|artificial)/.test(t)) {
    ops.push({ op: "unsupported", request: "narração com voz artificial", reason: "A narração por voz artificial ainda não está integrada (Fase 3)." });
  }

  const reply = said.length
    ? `Entendi. Vou ${joinPt(said)}.`
    : ops.length
      ? "Analisei seu pedido."
      : "Não consegui identificar uma edição nesse pedido. Exemplos: \"crie uma versão de 30 segundos\", \"retire os primeiros 5 segundos\", \"remova os silêncios\", \"formato vertical com legendas\", \"adicione a logo no final\".";
  return { reply, operations: dedupe(ops) };
}

function dedupe(ops: EditOperation[]): EditOperation[] {
  const seen = new Set<string>();
  return ops.filter((o) => {
    const k = JSON.stringify(o);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function joinPt(items: string[]): string {
  const u = [...new Set(items)];
  if (u.length <= 1) return u.join("");
  return `${u.slice(0, -1).join(", ")} e ${u[u.length - 1]}`;
}
