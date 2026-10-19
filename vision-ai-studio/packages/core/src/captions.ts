import type { TranscriptData, TranscriptWord } from "./analysis";
import { CAPTION_STYLES, type CaptionStyle, type CaptionStyleId } from "./caption-styles";
import { FORMAT_PRESETS } from "./presets";
import { type CaptionBlock, type Timeline, placeClips, round3 } from "./timeline";

/** Divide a transcrição em blocos curtos de legenda (tempo de origem). */
export function buildCaptionBlocks(t: TranscriptData, assetId: string, styleId: CaptionStyleId): CaptionBlock[] {
  const style = CAPTION_STYLES[styleId];
  const words: TranscriptWord[] = t.words.length ? t.words : wordsFromSegments(t);
  const blocks: CaptionBlock[] = [];
  let cur: TranscriptWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    const text = cur.map((w) => w.text.trim()).join(" ").replace(/\s+([,.!?;:…])/g, "$1");
    blocks.push({
      id: `b${blocks.length + 1}_${Math.round(cur[0].start * 1000)}`,
      assetId,
      start: round3(cur[0].start),
      end: round3(cur[cur.length - 1].end),
      text,
      words: cur.map((w) => ({ text: w.text.trim(), start: round3(w.start), end: round3(w.end) })),
    });
    cur = [];
  };
  for (const w of words) {
    if (!w.text.trim()) continue;
    const last = cur[cur.length - 1];
    const chars = cur.reduce((s, x) => s + x.text.length + 1, 0) + w.text.length;
    const dur = cur.length ? w.end - cur[0].start : 0;
    if (
      last &&
      (cur.length >= style.maxWordsPerBlock ||
        chars > style.maxCharsPerLine * 2 ||
        w.start - last.end > 0.6 ||
        dur > 3.2 ||
        (/[.!?…]$/.test(last.text) && cur.length >= 2))
    ) {
      flush();
    }
    cur.push(w);
  }
  flush();
  return blocks;
}

/** Quando o provedor não retorna palavras, distribui o tempo do segmento por caracteres. */
function wordsFromSegments(t: TranscriptData): TranscriptWord[] {
  const out: TranscriptWord[] = [];
  for (const seg of t.segments) {
    const parts = seg.text.trim().split(/\s+/).filter(Boolean);
    const totalChars = parts.reduce((s, p) => s + p.length, 0) || 1;
    let cursor = seg.start;
    for (const p of parts) {
      const d = ((seg.end - seg.start) * p.length) / totalChars;
      out.push({ text: p, start: cursor, end: cursor + d });
      cursor += d;
    }
  }
  return out;
}

export interface OutputCue {
  start: number;
  end: number;
  text: string;
  words: Array<{ text: string; start: number; end: number }>;
}

/** Projeta os blocos de legenda (tempo de origem) no tempo do vídeo final. */
export function captionCues(tl: Pick<Timeline, "clips" | "captions">): OutputCue[] {
  if (!tl.captions.enabled) return [];
  const cues: OutputCue[] = [];
  for (const p of placeClips(tl)) {
    const clip = p.clip;
    const offset = p.outStart - clip.sourceStart;
    for (const b of tl.captions.blocks) {
      if (b.assetId !== clip.assetId) continue;
      const s = Math.max(b.start, clip.sourceStart);
      const e = Math.min(b.end, clip.sourceEnd);
      if (e - s < 0.15) continue;
      const words = (b.words ?? [])
        .filter((w) => w.end > s + 0.01 && w.start < e - 0.01)
        .map((w) => ({
          text: w.text,
          start: round3(Math.max(w.start, s) + offset),
          end: round3(Math.min(w.end, e) + offset),
        }));
      // se o corte pegou só parte do bloco, mostra apenas as palavras visíveis
      const partial = b.words?.length && words.length && words.length < b.words.length;
      cues.push({
        start: round3(s + offset),
        end: round3(e + offset),
        text: partial ? words.map((w) => w.text).join(" ") : b.text,
        words,
      });
    }
  }
  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].end > cues[i + 1].start) cues[i].end = cues[i + 1].start;
  }
  return cues.filter((c) => c.end - c.start >= 0.1);
}

export function toSrt(cues: OutputCue[]): string {
  return (
    cues
      .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text.replace(/\r?\n/g, " ")}\n`)
      .join("\n")
  );
}

function srtTime(t: number): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(r).padStart(3, "0")}`;
}

function assTime(t: number): string {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const r = cs % 100;
  return `${h}:${pad(m)}:${pad(s)}.${pad(r)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Cor #RRGGBB + alfa (0 = opaco) → &HAABBGGRR do formato ASS. */
export function assColor(hex: string, transparency = 0): string {
  const h = hex.replace("#", "");
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  const a = Math.round(Math.min(1, Math.max(0, transparency)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

/** Remove caracteres de controle do ASS: o texto do usuário nunca vira comando de estilo. */
export function escapeAssText(s: string): string {
  return s
    .replace(/\\/g, "/")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

export function wrapLines(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > maxChars) {
      lines.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= 2) return lines;
  // no máximo 2 linhas: rebalanceia
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(" "), words.slice(half).join(" ")];
}

export interface AssOptions {
  width: number;
  height: number;
}

/** Gera o arquivo .ass (legendas estilizadas) consumido pelo filtro libass do FFmpeg. */
export function toAss(tl: Pick<Timeline, "clips" | "captions" | "format">, cues: OutputCue[], opts: AssOptions): string {
  const base = CAPTION_STYLES[tl.captions.style];
  const style: CaptionStyle = {
    ...base,
    primary: tl.captions.primaryColor ?? base.primary,
    highlight: tl.captions.highlightColor ?? base.highlight,
    uppercase: tl.captions.uppercase ?? base.uppercase,
  };
  const { width, height } = opts;
  const safe = FORMAT_PRESETS[tl.format.preset].safeArea;
  const fontSize = Math.round(height * style.sizeRatio * tl.captions.fontScale * (width < height ? 0.9 : 1.15));
  const outline = Math.max(0, Math.round(height * style.outlineWidthRatio));
  const alignment = tl.captions.position === "top" ? 8 : tl.captions.position === "center" ? 5 : 2;
  const marginV = Math.round(
    tl.captions.position === "top" ? safe.top * height : tl.captions.position === "bottom" ? safe.bottom * height : 0,
  );
  const marginL = Math.round(safe.left * width);
  const marginR = Math.round(safe.right * width);
  const borderStyle = style.box ? 3 : 1;
  const boxPad = style.box ? Math.round(fontSize * 0.25) : outline;
  const outlineColor = style.box ? assColor(style.boxColor, 1 - style.boxAlpha) : assColor(style.outline);
  const backColor = style.box ? assColor(style.boxColor, 1 - style.boxAlpha) : assColor("#000000", 0.6);

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "ScaledBorderAndShadow: yes",
    "WrapStyle: 2",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${style.font},${fontSize},${assColor(style.primary)},${assColor(style.highlight)},${outlineColor},${backColor},${style.bold ? -1 : 0},0,0,0,100,100,0,0,${borderStyle},${boxPad},${style.box ? 0 : 1},${alignment},${marginL},${marginR},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events: string[] = [];
  const maxChars = width < height ? style.maxCharsPerLine : Math.round(style.maxCharsPerLine * 1.6);
  const fade = style.fadeMs > 0 ? `{\\fad(${style.fadeMs},${Math.round(style.fadeMs / 2)})}` : "";
  const hl = assColor(style.highlight);
  const casing = (s: string) => (style.uppercase ? s.toLocaleUpperCase("pt-BR") : s);

  for (const cue of cues) {
    if (style.wordHighlight && cue.words.length > 1) {
      const lines = wrapLines(casing(escapeAssText(cue.words.map((w) => w.text).join(" "))), maxChars);
      const flatWords = lines.flatMap((l, li) => l.split(" ").map((w, wi, arr) => ({ w, br: li < lines.length - 1 && wi === arr.length - 1 })));
      cue.words.forEach((word, i) => {
        const start = i === 0 ? cue.start : word.start;
        const end = i === cue.words.length - 1 ? cue.end : cue.words[i + 1].start;
        if (end - start < 0.02) return;
        const text = flatWords
          .map((fw, j) => (j === i ? `{\\c${hl}}${fw.w}{\\c${assColor(style.primary)}}` : fw.w) + (fw.br ? "\\N" : " "))
          .join("")
          .replace(/ \\N/g, "\\N")
          .trim();
        events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,${text}`);
      });
    } else {
      const text = wrapLines(casing(escapeAssText(cue.text)), maxChars).join("\\N");
      events.push(`Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,${fade}${text}`);
    }
  }
  return [...header, ...events, ""].join("\n");
}
