import { type TranscriptData, weightedFocus } from "./analysis";
import { type MusicAnalysis, beatsUntil, nearest } from "./beats";
import { buildCaptionBlocks } from "./captions";
import type { EditOperation, EditPlan } from "./edit-plan";
import { FORMAT_PRESETS } from "./presets";
import {
  type SourceMap,
  removeOutputRange,
  selectForDuration,
  silencesToRemove,
  staticToRemove,
  subtractSourceIntervals,
  mergeContiguous,
  mapOutputRange,
} from "./selection";
import { getStyle } from "./styles";
import { LOOKS, TRANSITION_LABELS } from "./effects";
import {
  type Clip,
  type Timeline,
  clipsDuration,
  newClipId,
  parseTimeline,
  round3,
} from "./timeline";

/**
 * Motor determinístico de edição. Recebe a timeline atual + um plano validado e
 * devolve uma NOVA timeline. Sem efeitos colaterais, sem rede, sem FFmpeg:
 * é 100% testável. O renderizador transforma a timeline resultante em vídeo.
 */

export interface BrandContext {
  id: string;
  name: string;
  logoAssetId: string | null;
  musicAssetIds: string[];
  primaryColor: string | null;
  defaultStyleId: string | null;
  /** Cores extras da paleta da marca (fundo escuro e destaque) para a cartela. */
  backgroundColor?: string | null;
  accentColor?: string | null;
}

export interface EngineContext {
  sources: SourceMap;
  brand: BrandContext | null;
  /** Músicas que o usuário enviou para este projeto/organização (com licença declarada). */
  musicAssetIds: string[];
  /** Análise de batida das músicas disponíveis (para sincronizar cortes). */
  musicAnalyses?: Map<string, MusicAnalysis>;
  /** Narrações (voz) disponíveis no projeto. */
  voiceoverAssetIds?: string[];
  /** Palavras com tempo de cada narração (para legendas). */
  voiceoverTranscripts?: Map<string, TranscriptData>;
}

export interface EngineResult {
  timeline: Timeline;
  applied: string[];
  warnings: string[];
  unsupported: Array<{ request: string; reason: string }>;
}

export function applyEditPlan(current: Timeline, plan: EditPlan, ctx: EngineContext): EngineResult {
  let tl: Timeline = structuredClone(current);
  const applied: string[] = [];
  const warnings: string[] = [];
  const unsupported: Array<{ request: string; reason: string }> = [];

  for (const op of plan.operations) {
    try {
      const r = applyOperation(tl, op, ctx);
      tl = r.timeline;
      if (r.message) applied.push(r.message);
      warnings.push(...r.warnings);
      if (r.unsupported) unsupported.push(r.unsupported);
    } catch (err) {
      warnings.push(`Não foi possível aplicar "${op.op}": ${(err as Error).message}`);
    }
  }

  tl.clips = applyDynamicZoom(tl);
  tl.clips = applyAutoFocus(tl.clips, ctx.sources);
  if (tl.clips.length === 0) {
    throw new Error("A edição removeria todo o conteúdo do vídeo. Nenhuma alteração foi aplicada.");
  }
  return { timeline: parseTimeline(tl), applied, warnings, unsupported };
}

interface OpResult {
  timeline: Timeline;
  message?: string;
  warnings: string[];
  unsupported?: { request: string; reason: string };
}

function applyOperation(tl: Timeline, op: EditOperation, ctx: EngineContext): OpResult {
  const style = getStyle(tl.styleId);
  const total = clipsDuration(tl);
  const w: string[] = [];
  switch (op.op) {
    case "trim_start": {
      const s = clamp(op.seconds, 0, total - 0.5);
      if (s <= 0) return { timeline: tl, warnings: ["Corte inicial inválido."] };
      return { timeline: { ...tl, clips: removeOutputRange(tl.clips, 0, s) }, message: `Removidos os primeiros ${fmt(s)}s.`, warnings: w };
    }
    case "trim_end": {
      const s = clamp(op.seconds, 0, total - 0.5);
      if (s <= 0) return { timeline: tl, warnings: ["Corte final inválido."] };
      return { timeline: { ...tl, clips: removeOutputRange(tl.clips, total - s, total) }, message: `Removidos os últimos ${fmt(s)}s.`, warnings: w };
    }
    case "keep_range": {
      const start = clamp(op.start, 0, total);
      const end = clamp(op.end, 0, total);
      if (end - start < 0.5) return { timeline: tl, warnings: ["Trecho selecionado curto demais (mínimo 0,5s)."] };
      let clips = removeOutputRange(tl.clips, end, total);
      clips = removeOutputRange(clips, 0, start);
      return { timeline: { ...tl, clips }, message: `Mantido apenas o trecho de ${fmt(start)}s a ${fmt(end)}s.`, warnings: w };
    }
    case "remove_range": {
      const start = clamp(op.start, 0, total);
      const end = clamp(op.end, 0, total);
      if (end - start < 0.05) return { timeline: tl, warnings: ["Trecho a remover inválido."] };
      return { timeline: { ...tl, clips: removeOutputRange(tl.clips, start, end) }, message: `Removido o trecho de ${fmt(start)}s a ${fmt(end)}s.`, warnings: w };
    }
    case "target_duration": {
      const target = clamp(op.seconds, 3, 3600);
      const res = selectForDuration(tl.clips, ctx.sources, style, target, op.strategy);
      const hasAnalysis = [...ctx.sources.values()].some((s) => s.analysis);
      if (!hasAnalysis && op.strategy !== "beginning") {
        w.push("A análise do vídeo ainda não está disponível; a seleção usou apenas a divisão em trechos.");
      }
      const label =
        op.strategy === "beginning"
          ? "mantendo o início"
          : op.strategy === "speech_focused"
            ? "priorizando trechos com fala"
            : "selecionando os trechos com melhor pontuação heurística (movimento, fala e ausência de silêncio)";
      const unchanged = res.clips === tl.clips;
      return {
        timeline: { ...tl, clips: res.clips },
        message: unchanged ? undefined : `Versão de ~${fmt(clipsDuration({ clips: res.clips }))}s (alvo ${fmt(target)}s), ${label}.`,
        warnings: [...w, ...res.warnings],
      };
    }
    case "zoom_range": {
      const start = clamp(op.start, 0, total);
      const end = clamp(op.end, 0, total);
      if (end - start < 0.3) return { timeline: tl, warnings: ["Trecho de zoom curto demais."] };
      const zoom = clamp(op.zoom, 1, 2);
      const manual = op.focus_x != null || op.focus_y != null;
      const clips = mapOutputRange(tl.clips, start, end, (c) => ({
        ...c,
        zoom,
        ...(manual
          ? { focusX: clamp(op.focus_x ?? 0.5, 0, 1), focusY: clamp(op.focus_y ?? 0.5, 0, 1), focusSource: "manual" as const }
          : {}),
      }));
      return {
        timeline: { ...tl, clips },
        message: `Aproximação de ${zoom.toFixed(2)}x entre ${fmt(start)}s e ${fmt(end)}s.`,
        warnings: w,
      };
    }
    case "remove_silences": {
      const min = clamp(op.min_silence_sec, 0.3, 10);
      const pad = clamp(op.padding_sec, 0, 0.5);
      const hasInfo = [...ctx.sources.values()].some((s) => s.analysis?.hasAudio || s.transcript);
      if (!hasInfo) {
        return { timeline: tl, warnings: ["Não há áudio analisado para detectar silêncios."] };
      }
      const before = total;
      const clips = subtractSourceIntervals(tl.clips, silencesToRemove(ctx.sources, min, pad));
      const after = clipsDuration({ clips });
      return {
        timeline: { ...tl, clips },
        message: after < before - 0.05 ? `Removidos ${fmt(before - after)}s de silêncio.` : "Nenhum silêncio longo encontrado.",
        warnings: w,
      };
    }
    case "remove_static": {
      const min = clamp(op.min_duration_sec, 1, 30);
      const hasActivity = [...ctx.sources.values()].some((s) => s.analysis?.activity);
      if (!hasActivity) return { timeline: tl, warnings: ["A análise de movimento não está disponível para este vídeo."] };
      const before = total;
      const clips = subtractSourceIntervals(tl.clips, staticToRemove(ctx.sources, min));
      const after = clipsDuration({ clips });
      return {
        timeline: { ...tl, clips },
        message: after < before - 0.05 ? `Removidos ${fmt(before - after)}s sem movimento e sem som.` : "Nenhum trecho parado encontrado.",
        warnings: w,
      };
    }
    case "set_format": {
      const preset = FORMAT_PRESETS[op.preset];
      return { timeline: { ...tl, format: { ...tl.format, preset: op.preset } }, message: `Formato alterado para ${preset.label}.`, warnings: w };
    }
    case "set_reframe": {
      const labels = { fill: "preencher o quadro com recorte inteligente", fit_blur: "vídeo inteiro com fundo desfocado", fit: "vídeo inteiro com barras" };
      return { timeline: { ...tl, format: { ...tl.format, reframe: op.mode } }, message: `Enquadramento: ${labels[op.mode]}.`, warnings: w };
    }
    case "set_captions": {
      if (!op.enabled) {
        return { timeline: { ...tl, captions: { ...tl.captions, enabled: false } }, message: "Legendas desativadas.", warnings: w };
      }
      const assetIds = [...new Set(tl.clips.map((c) => c.assetId))];
      let blocks = tl.captions.blocks;
      const styleId = op.style ?? tl.captions.style ?? style.captionStyle;
      const missing = assetIds.filter((id) => !ctx.sources.get(id)?.transcript);
      if (!blocks.length) {
        blocks = assetIds.flatMap((id) => {
          const t = ctx.sources.get(id)?.transcript;
          return t ? buildCaptionBlocks(t, id, styleId) : [];
        });
      }
      const vo = tl.audio.voiceover;
      const voT = vo ? ctx.voiceoverTranscripts?.get(vo.assetId) : undefined;
      if (vo && voT && !blocks.some((b) => b.assetId === vo.assetId)) blocks = [...blocks, ...buildCaptionBlocks(voT, vo.assetId, styleId)];
      if (!blocks.length) {
        return {
          timeline: tl,
          warnings: ["As legendas precisam da transcrição do áudio, que ainda não existe para este projeto."],
        };
      }
      if (missing.length) w.push("Alguns vídeos ainda não têm transcrição; eles ficarão sem legenda.");
      return {
        timeline: {
          ...tl,
          captions: { ...tl.captions, enabled: true, style: styleId, position: op.position ?? tl.captions.position, blocks },
        },
        message: `Legendas automáticas ativadas (${blocks.length} blocos).`,
        warnings: w,
      };
    }
    case "add_logo": {
      const logoId = ctx.brand?.logoAssetId;
      if (!logoId) {
        return {
          timeline: tl,
          warnings: [],
          unsupported: {
            request: "adicionar logo",
            reason: ctx.brand
              ? `A marca ${ctx.brand.name} ainda não tem logo oficial cadastrada. Envie a logo em "Minhas Marcas".`
              : "Selecione uma marca com logo oficial cadastrada para o projeto.",
          },
        };
      }
      const previous = tl.logos.find((l) => l.mode === op.placement);
      const logos = tl.logos.filter((l) => l.mode !== op.placement);
      logos.push(
        op.placement === "end_card"
          ? { ...endCardFor(logoId, ctx), headline: previous?.headline, cta: previous?.cta, durationSec: clamp(op.duration_sec ?? 3.5, 1, 10) }
          : {
              assetId: logoId,
              mode: "watermark",
              durationSec: clamp(op.duration_sec ?? 3, 1, 10),
              position: "top_right",
              backgroundColor: "#0B0B0C",
              scale: 0.14,
            },
      );
      return {
        timeline: { ...tl, logos },
        message: op.placement === "end_card" ? `Cartela final com a logo oficial de ${ctx.brand?.name}.` : `Logo de ${ctx.brand?.name} no canto do vídeo.`,
        warnings: w,
      };
    }
    case "remove_logo": {
      const logos = op.placement === "all" ? [] : tl.logos.filter((l) => l.mode !== op.placement);
      return { timeline: { ...tl, logos }, message: "Logo removida.", warnings: w };
    }
    case "set_music": {
      if (op.action === "remove") {
        return { timeline: { ...tl, audio: { ...tl.audio, music: null } }, message: "Música removida.", warnings: w };
      }
      if (op.action === "adjust") {
        if (!tl.audio.music) return { timeline: tl, warnings: ["Não há música no projeto para ajustar."] };
        return {
          timeline: {
            ...tl,
            audio: {
              ...tl.audio,
              music: {
                ...tl.audio.music,
                volume: op.volume != null ? clamp(op.volume, 0, 1.5) : tl.audio.music.volume,
                ducking: op.ducking ?? tl.audio.music.ducking,
              },
            },
          },
          message: "Volume da música ajustado.",
          warnings: w,
        };
      }
      const allowed = new Set([...ctx.musicAssetIds, ...(ctx.brand?.musicAssetIds ?? [])]);
      let assetId = op.asset_id && allowed.has(op.asset_id) ? op.asset_id : null;
      if (!assetId) assetId = ctx.brand?.musicAssetIds[0] ?? ctx.musicAssetIds[0] ?? null;
      if (!assetId) {
        return {
          timeline: tl,
          warnings: [],
          unsupported: {
            request: "adicionar música",
            reason:
              "Nenhuma música licenciada foi enviada para este projeto ou marca. Envie uma faixa que você tenha direito de usar (aba Áudio) e peça novamente.",
          },
        };
      }
      return {
        timeline: {
          ...tl,
          audio: {
            ...tl.audio,
            music: {
              assetId,
              volume: op.volume != null ? clamp(op.volume, 0, 1.5) : style.musicVolume,
              ducking: op.ducking ?? true,
              fadeInSec: 1,
              fadeOutSec: 2,
            },
          },
        },
        message: "Música adicionada com redução automática durante a fala.",
        warnings: w,
      };
    }
    case "set_audio": {
      const audio = { ...tl.audio };
      if (op.original_volume != null) audio.originalVolume = clamp(op.original_volume, 0, 2);
      if (op.normalize != null) audio.normalize = op.normalize;
      if (op.denoise != null) audio.denoise = op.denoise;
      return { timeline: { ...tl, audio }, message: "Áudio ajustado.", warnings: w };
    }
    case "set_style": {
      const s = getStyle(op.style_id);
      return {
        timeline: {
          ...tl,
          styleId: s.id,
          format: { ...tl.format, reframe: s.reframe },
          captions: { ...tl.captions, style: s.captionStyle },
          transitions: { type: s.transition, durationSec: s.transitionSec },
          look: s.look,
          audio: { ...tl.audio, sfx: s.sfx },
          dynamicZoom: { ...tl.dynamicZoom, enabled: s.dynamicZoom },
        },
        message: `Estilo "${s.label}" aplicado.`,
        warnings: w,
      };
    }
    case "remove_source_range": {
      const start = Math.max(0, op.start);
      const end = op.end;
      if (end - start < 0.05) return { timeline: tl, warnings: ["Trecho da transcrição inválido."] };
      const clips = subtractSourceIntervals(tl.clips, new Map([[op.asset_id, [{ start, end }]]]));
      const removed = total - clipsDuration({ clips });
      if (removed < 0.01) return { timeline: tl, warnings: ["Esse trecho já não faz parte do vídeo."] };
      return { timeline: { ...tl, clips }, message: `Removido trecho de ${fmt(removed)}s pela transcrição.`, warnings: w };
    }
    case "restore_source_range": {
      const src = ctx.sources.get(op.asset_id);
      const start = clamp(op.start, 0, src?.duration || op.end);
      const end = clamp(op.end, start, src?.duration || op.end);
      if (end - start < 0.05) return { timeline: tl, warnings: ["Trecho inválido para restaurar."] };
      const clips = restoreSourceRange(tl.clips, op.asset_id, start, end);
      const added = clipsDuration({ clips }) - total;
      if (added < 0.01) return { timeline: tl, warnings: ["Esse trecho já está no vídeo."] };
      return { timeline: { ...tl, clips }, message: `Restaurado trecho de ${fmt(added)}s da transcrição.`, warnings: w };
    }
    case "sync_to_beat": {
      const music = tl.audio.music;
      const analysis = music ? ctx.musicAnalyses?.get(music.assetId) : undefined;
      if (!music) return { timeline: tl, warnings: ["Adicione uma música ao projeto para sincronizar os cortes com a batida."] };
      if (!analysis?.beats.length) {
        return {
          timeline: tl,
          warnings: [],
          unsupported: { request: "sincronizar com a batida", reason: "Não foi possível identificar uma batida regular nesta música (ou ela ainda está sendo analisada)." },
        };
      }
      const shift = clamp(op.max_shift_sec, 0.05, 1);
      const r = snapCutsToBeats(tl.clips, beatsUntil(analysis, total + 2), shift, ctx.sources);
      return {
        timeline: { ...tl, clips: r.clips },
        message: r.snapped ? `${r.snapped} corte(s) alinhados à batida (${analysis.bpm} BPM).` : "Os cortes já estavam alinhados à batida ou distantes demais dela.",
        warnings: w,
      };
    }
    case "set_transitions": {
      const durationSec = clamp(op.duration_sec ?? tl.transitions.durationSec ?? 0.4, 0.2, 1);
      return {
        timeline: { ...tl, transitions: { type: op.type, durationSec } },
        message: op.type === "none" ? "Transições removidas (cortes secos)." : `Transição "${TRANSITION_LABELS[op.type]}" em todos os cortes.`,
        warnings: w,
      };
    }
    case "set_look": {
      return {
        timeline: { ...tl, look: op.look },
        message: op.look === "none" ? "Cor original restaurada." : `Tratamento de cor "${LOOKS[op.look].label}" aplicado.`,
        warnings: w,
      };
    }
    case "add_text": {
      const text = op.text.replace(/\s+/g, " ").trim().slice(0, 120);
      if (!text) return { timeline: tl, warnings: ["Texto vazio ignorado."] };
      const defaults = { hook: 3, title: 3, cta: 3.5, lower_third: 4 } as const;
      const positions = { hook: "top", title: "center", cta: "bottom", lower_third: "bottom" } as const;
      const texts = tl.texts.filter((t) => op.role !== "hook" || t.role !== "hook").slice(-19);
      texts.push({
        id: newClipId(),
        text,
        role: op.role,
        anchor: op.anchor,
        offsetSec: clamp(op.offset_sec ?? 0, 0, Math.max(0, total - 1)),
        durationSec: clamp(op.duration_sec ?? defaults[op.role], 0.8, Math.max(1, Math.min(15, total))),
        position: op.position ?? positions[op.role],
      });
      const labels = { hook: "Gancho animado", title: "Título animado", cta: "Chamada para ação animada", lower_third: "Identificação animada" } as const;
      return { timeline: { ...tl, texts }, message: `${labels[op.role]}: "${text}".`, warnings: w };
    }
    case "clear_texts": {
      const texts = op.role ? tl.texts.filter((t) => t.role !== op.role) : [];
      return { timeline: { ...tl, texts }, message: "Textos removidos.", warnings: w };
    }
    case "dynamic_zoom": {
      const intensity = clamp(op.intensity ?? tl.dynamicZoom.intensity ?? 0.12, 0.05, 0.3);
      return {
        timeline: { ...tl, dynamicZoom: { enabled: op.enabled, intensity } },
        message: op.enabled ? "Zoom dinâmico nos cortes (aproximações alternadas)." : "Zoom dinâmico desativado.",
        warnings: w,
      };
    }
    case "set_end_card": {
      let logos = tl.logos;
      if (!logos.some((l) => l.mode === "end_card")) {
        const logoId = ctx.brand?.logoAssetId;
        if (!logoId) {
          return {
            timeline: tl,
            warnings: [],
            unsupported: {
              request: "cartela final",
              reason: ctx.brand
                ? `A marca ${ctx.brand.name} ainda não tem logo oficial cadastrada. Envie a logo em "Minhas Marcas".`
                : "Selecione uma marca com logo oficial cadastrada para o projeto.",
            },
          };
        }
        logos = [...logos, endCardFor(logoId, ctx)];
      }
      const clean = (v: string | null, max: number) => (v ? v.replace(/\s+/g, " ").trim().slice(0, max) || undefined : undefined);
      logos = logos.map((l) =>
        l.mode === "end_card"
          ? {
              ...l,
              headline: clean(op.headline, 60),
              cta: clean(op.cta, 40),
              durationSec: op.duration_sec != null ? clamp(op.duration_sec, 2, 6) : Math.max(l.durationSec, op.headline || op.cta ? 3.5 : l.durationSec),
            }
          : l,
      );
      return { timeline: { ...tl, logos }, message: "Cartela final animada com a logo oficial, frase e chamada para ação.", warnings: w };
    }
    case "set_sfx": {
      return {
        timeline: { ...tl, audio: { ...tl.audio, sfx: op.enabled } },
        message: op.enabled ? "Efeitos sonoros: whoosh nas transições, pop nos textos e impacto na cartela." : "Efeitos sonoros desativados.",
        warnings: w,
      };
    }
    case "generate_music":
      // chega aqui só se o worker não pôde gerar (sem provedor configurado ou falha)
      return {
        timeline: tl,
        warnings: [],
        unsupported: {
          request: "gerar trilha sonora com IA",
          reason: "A geração de trilha por IA não está configurada no servidor (ELEVENLABS_API_KEY). Envie uma música licenciada na aba Áudio.",
        },
      };
    case "add_narration":
      return {
        timeline: tl,
        warnings: [],
        unsupported: {
          request: "narração com voz de IA",
          reason: "A narração por voz de IA não está configurada no servidor (ELEVENLABS_API_KEY).",
        },
      };
    case "remove_narration": {
      const voId = tl.audio.voiceover?.assetId;
      const captions = voId ? { ...tl.captions, blocks: tl.captions.blocks.filter((b) => b.assetId !== voId) } : tl.captions;
      return { timeline: { ...tl, captions, audio: { ...tl.audio, voiceover: null } }, message: "Narração removida.", warnings: w };
    }
    case "set_voiceover": {
      if (!ctx.voiceoverAssetIds?.includes(op.asset_id)) {
        return { timeline: tl, warnings: ["A narração indicada não pertence a este projeto."] };
      }
      const voiceover = {
        assetId: op.asset_id,
        startSec: clamp(op.start_sec ?? 0, 0, Math.max(0, total - 0.5)),
        volume: clamp(op.volume ?? 1, 0, 2),
      };
      // com legendas ligadas, a narração ganha legenda (substitui a de narrações anteriores)
      let captions = tl.captions;
      const voT = ctx.voiceoverTranscripts?.get(op.asset_id);
      if (captions.enabled && voT) {
        const others = captions.blocks.filter((b) => !ctx.voiceoverAssetIds?.includes(b.assetId));
        captions = { ...captions, blocks: [...others, ...buildCaptionBlocks(voT, op.asset_id, captions.style)] };
      }
      return { timeline: { ...tl, captions, audio: { ...tl.audio, voiceover } }, message: "Narração com voz de IA adicionada.", warnings: w };
    }
    case "unsupported":
      return { timeline: tl, warnings: [], unsupported: { request: op.request, reason: op.reason } };
  }
}

/**
 * Reenquadramento automático: para cada clipe sem ajuste manual, centraliza o
 * recorte na região com mais movimento detectado no trecho. Sem análise, centraliza.
 */
/** Cartela final padrão: fundo escuro da marca com degradê para a cor de destaque. */
function endCardFor(logoId: string, ctx: EngineContext) {
  const accent = ctx.brand?.primaryColor && !isDark(ctx.brand.primaryColor) ? ctx.brand.primaryColor : (ctx.brand?.accentColor ?? "#C9A227");
  return {
    assetId: logoId,
    mode: "end_card" as const,
    durationSec: 3.5,
    position: "top_right" as const,
    backgroundColor: ctx.brand?.backgroundColor ?? "#0B0B0C",
    scale: 0.5,
    accentColor: accent,
  };
}

function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 90;
}

/**
 * Zoom dinâmico (punch-in), recalculado a cada edição: desfaz as aproximações
 * automáticas anteriores e, se ativo, divide trechos longos em cortes secos que
 * alternam enquadramento normal e aproximado. Zooms manuais não são tocados.
 */
export function applyDynamicZoom(tl: Timeline): Clip[] {
  const base = mergeContiguous(tl.clips.map((c) => (c.punch ? { ...c, zoom: 1, punch: false } : c)));
  if (!tl.dynamicZoom.enabled) return base;
  const style = getStyle(tl.styleId);
  const seg = clamp((style.minClipSec + style.maxClipSec) / 2, 1.6, 3.2);
  const out: Clip[] = [];
  let toggle = false;
  for (const c of base) {
    const dur = c.sourceEnd - c.sourceStart;
    if (c.zoom > 1.001) {
      out.push(c);
      continue;
    }
    const n = dur >= seg * 1.6 ? Math.max(2, Math.round(dur / seg)) : 1;
    for (let k = 0; k < n; k++) {
      const s = round3(c.sourceStart + (dur * k) / n);
      const e = k === n - 1 ? c.sourceEnd : round3(c.sourceStart + (dur * (k + 1)) / n);
      const punch = n > 1 ? k % 2 === 1 : toggle;
      out.push({ ...c, id: k === 0 ? c.id : newClipId(), sourceStart: s, sourceEnd: e, zoom: punch ? round3(1 + tl.dynamicZoom.intensity) : 1, punch });
    }
    toggle = !toggle;
  }
  return out;
}

export function applyAutoFocus(clips: Clip[], sources: SourceMap): Clip[] {
  // junta trechos contíguos antes de recalcular o foco automático (o foco é derivado, não decisão do usuário)
  const normalized = mergeContiguous(
    clips.map((c) => (c.focusSource === "manual" ? c : { ...c, focusX: null, focusY: null, focusSource: "center" as const })),
  );
  return mergeContiguous(
    normalized.map((c) => {
      if (c.focusSource === "manual") return c;
      const activity = sources.get(c.assetId)?.analysis?.activity;
      const f = activity ? weightedFocus(activity, c.sourceStart, c.sourceEnd) : null;
      if (!f) return { ...c, focusX: null, focusY: null, focusSource: "center" as const };
      return { ...c, focusX: f.x, focusY: f.y, focusSource: "auto_motion" as const };
    }),
  );
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function fmt(n: number): string {
  return round3(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/** Reinsere um trecho da origem na posição cronológica correta, sem duplicar o que já existe. */
export function restoreSourceRange(clips: Clip[], assetId: string, start: number, end: number): Clip[] {
  // partes do intervalo que ainda não estão em nenhum clipe
  let missing = [{ start, end }];
  for (const c of clips.filter((x) => x.assetId === assetId)) {
    missing = missing.flatMap((m) => {
      if (c.sourceEnd <= m.start || c.sourceStart >= m.end) return [m];
      const parts = [];
      if (c.sourceStart > m.start) parts.push({ start: m.start, end: c.sourceStart });
      if (c.sourceEnd < m.end) parts.push({ start: c.sourceEnd, end: m.end });
      return parts;
    });
  }
  const out = [...clips];
  for (const m of missing.filter((x) => x.end - x.start > 0.04)) {
    const template = out.find((c) => c.assetId === assetId);
    const clip: Clip = {
      ...(template ?? { id: "", assetId, focusX: null, focusY: null, focusSource: "center", volume: 1, zoom: 1, punch: false, sourceStart: 0, sourceEnd: 0 }),
      id: newClipId(),
      assetId,
      sourceStart: round3(m.start),
      sourceEnd: round3(m.end),
      zoom: 1,
      punch: false,
      label: "Restaurado pela transcrição",
    };
    // insere depois do último clipe do mesmo arquivo que começa antes do trecho
    let idx = -1;
    out.forEach((c, i) => {
      if (c.assetId === assetId && c.sourceStart < m.start) idx = i;
    });
    if (idx === -1) {
      const firstSame = out.findIndex((c) => c.assetId === assetId);
      out.splice(firstSame === -1 ? out.length : firstSame, 0, clip);
    } else {
      out.splice(idx + 1, 0, clip);
    }
  }
  return mergeContiguous(out);
}

/** Ajusta o fim de cada trecho (exceto o último) para cair na batida mais próxima. */
export function snapCutsToBeats(clips: Clip[], beats: number[], maxShift: number, sources: SourceMap): { clips: Clip[]; snapped: number } {
  const out = clips.map((c) => ({ ...c }));
  let t = 0;
  let snapped = 0;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    const dur = c.sourceEnd - c.sourceStart;
    const cut = t + dur;
    if (i < out.length - 1) {
      const b = nearest(beats, cut);
      if (b !== null && Math.abs(b - cut) <= maxShift && Math.abs(b - cut) > 0.01) {
        const newDur = b - t;
        const maxEnd = sources.get(c.assetId)?.duration || c.sourceEnd;
        if (newDur >= 0.5 && c.sourceStart + newDur <= maxEnd + 0.001) {
          c.sourceEnd = round3(c.sourceStart + newDur);
          snapped++;
        }
      }
    }
    t += c.sourceEnd - c.sourceStart;
  }
  return { clips: out, snapped };
}
