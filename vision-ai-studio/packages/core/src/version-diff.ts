import { FORMAT_PRESETS } from "./presets";
import { CAPTION_STYLES } from "./caption-styles";
import { type Timeline, clipsDuration, timelineDuration } from "./timeline";

/** Resumo legível das diferenças entre duas versões (para a tela de comparação). */
export function diffTimelines(a: Timeline, b: Timeline): string[] {
  const out: string[] = [];
  const da = timelineDuration(a);
  const db = timelineDuration(b);
  if (Math.abs(da - db) > 0.05) out.push(`Duração: ${da.toFixed(1)}s → ${db.toFixed(1)}s`);
  if (a.clips.length !== b.clips.length) out.push(`Cortes: ${a.clips.length} → ${b.clips.length} trechos`);
  else if (JSON.stringify(a.clips.map((c) => [c.sourceStart, c.sourceEnd])) !== JSON.stringify(b.clips.map((c) => [c.sourceStart, c.sourceEnd])))
    out.push("Trechos selecionados alterados");
  if (a.format.preset !== b.format.preset) out.push(`Formato: ${FORMAT_PRESETS[a.format.preset].label} → ${FORMAT_PRESETS[b.format.preset].label}`);
  if (a.format.reframe !== b.format.reframe) out.push(`Enquadramento: ${a.format.reframe} → ${b.format.reframe}`);
  if (a.captions.enabled !== b.captions.enabled) out.push(b.captions.enabled ? "Legendas ativadas" : "Legendas desativadas");
  else if (b.captions.enabled && a.captions.style !== b.captions.style)
    out.push(`Estilo de legenda: ${CAPTION_STYLES[a.captions.style].label} → ${CAPTION_STYLES[b.captions.style].label}`);
  if (JSON.stringify(a.captions.blocks) !== JSON.stringify(b.captions.blocks) && a.captions.blocks.length && b.captions.blocks.length)
    out.push("Texto/tempo das legendas editado");
  if (Boolean(a.audio.music) !== Boolean(b.audio.music)) out.push(b.audio.music ? "Música adicionada" : "Música removida");
  if (a.audio.normalize !== b.audio.normalize) out.push(b.audio.normalize ? "Normalização ativada" : "Normalização desativada");
  if (a.audio.denoise !== b.audio.denoise) out.push(b.audio.denoise ? "Redução de ruído ativada" : "Redução de ruído desativada");
  const la = a.logos.map((l) => l.mode).join(",");
  const lb = b.logos.map((l) => l.mode).join(",");
  if (la !== lb) out.push(`Logo: ${la || "nenhuma"} → ${lb || "nenhuma"}`);
  if (a.styleId !== b.styleId) out.push(`Estilo: ${a.styleId ?? "-"} → ${b.styleId ?? "-"}`);
  if (!out.length && clipsDuration(a) === clipsDuration(b)) out.push("Sem diferenças relevantes");
  return out;
}
