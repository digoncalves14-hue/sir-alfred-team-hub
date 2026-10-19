import { buildUnits, scoreUnits, type SourceMap } from "./selection";
import { getStyle } from "./styles";
import { round3, type Clip } from "./timeline";

export interface ClipSuggestion {
  assetId: string;
  start: number;
  end: number;
  duration: number;
  /** Estimativa heurística 0–100 (movimento, fala, ausência de silêncio). Não prevê engajamento. */
  score: number;
  title: string;
  reasons: string[];
  transcriptExcerpt: string | null;
}

/**
 * Sugere cortes curtos a partir das gravações completas (vídeo longo → clipes).
 * Janelas começam em início de frase (quando há transcrição) ou em limites de
 * cena/silêncio, terminam em fim de frase e não se sobrepõem.
 */
export function suggestClips(
  sources: SourceMap,
  opts: { durationSec: number; count: number; styleId?: string | null },
): ClipSuggestion[] {
  const style = getStyle(opts.styleId);
  const target = Math.max(5, opts.durationSec);
  const candidates: ClipSuggestion[] = [];
  for (const src of sources.values()) {
    if (!src.duration) continue;
    const whole: Clip = { id: "all", assetId: src.assetId, sourceStart: 0, sourceEnd: src.duration, focusX: null, focusY: null, focusSource: "center", volume: 1, zoom: 1, punch: false };
    const unitStyle = { ...style, maxClipSec: Math.min(style.maxClipSec, target / 2), minClipSec: Math.min(style.minClipSec, target / 4) };
    const units = scoreUnits(buildUnits([whole], sources, unitStyle), sources, unitStyle);
    for (let i = 0; i < units.length; i++) {
      let end = units[i].start;
      let weighted = 0;
      const reasons = new Set<string>();
      let j = i;
      while (j < units.length && units[j].end - units[i].start <= target * 1.12) {
        const d = units[j].end - units[j].start;
        weighted += units[j].score * d;
        units[j].reasons.forEach((r) => reasons.add(r));
        end = units[j].end;
        j++;
      }
      const dur = end - units[i].start;
      if (dur < target * 0.75) continue;
      const words = src.transcript?.words.filter((w) => w.start >= units[i].start && w.end <= end) ?? [];
      const sentence = src.transcript?.segments.find((s) => s.start >= units[i].start - 0.05 && s.start < end)?.text ?? null;
      const mm = Math.floor(units[i].start / 60);
      const ss = Math.floor(units[i].start % 60);
      candidates.push({
        assetId: src.assetId,
        start: round3(units[i].start),
        end: round3(end),
        duration: round3(dur),
        score: Math.round((weighted / dur) * 100),
        title: sentence ? truncate(sentence, 70) : `Trecho de ${mm}:${String(ss).padStart(2, "0")}`,
        reasons: [...reasons].filter((r) => r !== "encurtado"),
        transcriptExcerpt: words.length ? truncate(words.map((w) => w.text).join(" "), 220) : null,
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.start - b.start);
  const picked: ClipSuggestion[] = [];
  for (const c of candidates) {
    if (picked.length >= opts.count) break;
    const overlaps = picked.some((p) => p.assetId === c.assetId && Math.min(p.end, c.end) - Math.max(p.start, c.start) > 0.2 * Math.min(p.duration, c.duration));
    if (!overlaps) picked.push(c);
  }
  return picked;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}
