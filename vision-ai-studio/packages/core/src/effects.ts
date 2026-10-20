import { CAPTION_STYLES } from "./caption-styles";
import { readableOn } from "./color";
export { readableOn } from "./color";
import { type OutputCue, assColor, escapeAssText, toAss, wrapLines } from "./captions";
import { FORMAT_PRESETS } from "./presets";
import {
  type LogoConfig,
  type LookId,
  type TextOverlay,
  type Timeline,
  type TransitionId,
  clipDuration,
  clipsDuration,
  round3,
} from "./timeline";

/**
 * Efeitos de acabamento: looks de cor, transições, textos animados e cartela final.
 * Cada efeito tem uma versão FFmpeg (render, valores calculados aqui) e uma versão
 * CSS (prévia no navegador) para que a prévia se aproxime do arquivo exportado.
 */

export interface LookDef {
  id: LookId;
  label: string;
  /** Cadeia de filtros FFmpeg (constante, sem entrada do usuário). */
  ffmpeg: string | null;
  /** Filtro CSS equivalente para a prévia. */
  css: string | null;
  vignette: boolean;
}

export const LOOKS: Record<LookId, LookDef> = {
  none: { id: "none", label: "Original", ffmpeg: null, css: null, vignette: false },
  cinematic: {
    id: "cinematic",
    label: "Cinematográfico",
    ffmpeg: "eq=contrast=1.08:saturation=0.88:gamma=0.97,colorbalance=rs=-0.04:gs=-0.01:bs=0.05:rh=0.05:gh=0.01:bh=-0.05,vignette=angle=PI/5",
    css: "contrast(1.08) saturate(0.88) sepia(0.1) hue-rotate(-6deg)",
    vignette: true,
  },
  warm: {
    id: "warm",
    label: "Quente",
    ffmpeg: "colorbalance=rs=0.05:gs=0.01:bs=-0.05:rm=0.05:bm=-0.04,eq=saturation=1.08:contrast=1.03",
    css: "sepia(0.18) saturate(1.15) contrast(1.03)",
    vignette: false,
  },
  vibrant: {
    id: "vibrant",
    label: "Vibrante",
    ffmpeg: "eq=saturation=1.32:contrast=1.06:brightness=0.01",
    css: "saturate(1.32) contrast(1.06) brightness(1.01)",
    vignette: false,
  },
  cool: {
    id: "cool",
    label: "Frio",
    ffmpeg: "colorbalance=rs=-0.04:bs=0.06:bm=0.04,eq=saturation=0.95:contrast=1.04",
    css: "saturate(0.95) contrast(1.04) hue-rotate(8deg)",
    vignette: false,
  },
  bw: {
    id: "bw",
    label: "Preto e branco",
    ffmpeg: "hue=s=0,eq=contrast=1.18:brightness=-0.01",
    css: "grayscale(1) contrast(1.18)",
    vignette: false,
  },
  clean: {
    id: "clean",
    label: "Claro e limpo",
    ffmpeg: "eq=brightness=0.035:contrast=1.04:saturation=1.06",
    css: "brightness(1.04) contrast(1.04) saturate(1.06)",
    vignette: false,
  },
};

export const TRANSITION_LABELS: Record<TransitionId, string> = {
  none: "Corte seco",
  fade: "Fade pelo preto",
  flash: "Flash branco",
  zoom: "Zoom (punch)",
  blur: "Desfoque rápido",
  slide: "Deslizar",
  glitch: "Glitch (falha digital)",
  light: "Flash de luz quente",
};

export interface ClipEdges {
  /** Duração do efeito de entrada/saída deste clipe (0 = sem efeito). */
  inSec: number;
  outSec: number;
}

/**
 * Metade da transição fica no fim do clipe que sai e metade no começo do que entra.
 * O último clipe também "sai" para a cartela final, quando ela existe.
 */
export function transitionEdges(tl: Pick<Timeline, "clips" | "transitions" | "logos">): ClipEdges[] {
  const type = tl.transitions.type;
  const hasCard = tl.logos.some((l) => l.mode === "end_card");
  const half = tl.transitions.durationSec / 2;
  return tl.clips.map((c, i) => {
    if (type === "none") return { inSec: 0, outSec: 0 };
    const max = clipDuration(c) * 0.3;
    const prev = tl.clips[i - 1];
    const next = tl.clips[i + 1];
    // cortes dentro do mesmo trecho contínuo (zoom dinâmico) ficam secos
    const continuous = (a?: typeof c, b?: typeof c) => Boolean(a && b && a.assetId === b.assetId && Math.abs(a.sourceEnd - b.sourceStart) < 0.05);
    const hasPrev = i > 0 && !continuous(prev, c);
    const hasNext = next ? !continuous(c, next) : hasCard;
    return {
      inSec: hasPrev ? round3(Math.min(half, max)) : 0,
      outSec: hasNext ? round3(Math.min(half, max)) : 0,
    };
  });
}

/** Cadeia FFmpeg de look + transição para um clipe já reenquadrado (W×H). */
export function clipEffectsChain(
  tl: Pick<Timeline, "transitions" | "look">,
  edges: ClipEdges,
  durSec: number,
  W: number,
  H: number,
  fps: number,
): string {
  const parts: string[] = [];
  const look = LOOKS[tl.look];
  if (look.ffmpeg) parts.push(look.ffmpeg);
  const { inSec, outSec } = edges;
  const outStart = round3(Math.max(0, durSec - outSec));
  switch (tl.transitions.type) {
    case "fade":
    case "flash":
    case "light": {
      const color = tl.transitions.type === "flash" ? "white" : tl.transitions.type === "light" ? "0xFFB061" : "black";
      if (inSec > 0) parts.push(`fade=t=in:st=0:d=${inSec}:color=${color}`);
      if (outSec > 0) parts.push(`fade=t=out:st=${outStart}:d=${outSec}:color=${color}`);
      break;
    }
    case "blur": {
      if (inSec > 0) {
        parts.push(`gblur=sigma=26:enable='lt(t,${round3(inSec / 2)})'`);
        parts.push(`gblur=sigma=10:enable='between(t,${round3(inSec / 2)},${inSec})'`);
      }
      if (outSec > 0) {
        parts.push(`gblur=sigma=10:enable='between(t,${outStart},${round3(outStart + outSec / 2)})'`);
        parts.push(`gblur=sigma=26:enable='gte(t,${round3(outStart + outSec / 2)})'`);
      }
      break;
    }
    case "zoom": {
      const frames = Math.max(1, Math.round(durSec * fps));
      const inF = Math.max(1, Math.round(inSec * fps));
      const outF = Math.max(1, Math.round(outSec * fps));
      const terms: string[] = [];
      if (inSec > 0) terms.push(`max(0,1-on/${inF})`);
      if (outSec > 0) terms.push(`max(0,(on-${frames - outF})/${outF})`);
      if (terms.length) {
        // amplia antes do zoompan para o movimento sair suave (sem "tremido" de arredondamento)
        parts.push(`scale=${W * 2}:${H * 2}:flags=bicubic`);
        parts.push(`zoompan=z='1+0.24*(${terms.join("+")})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${fps}`);
        parts.push("setsar=1");
      }
      break;
    }
    case "slide": {
      // o clipe entra deslizando pela direita e sai pela esquerda (suavizado), sem sobrepor clipes
      if (inSec > 0 || outSec > 0) {
        const ease = (p: string) => `(${p})*(${p})*(3-2*(${p}))`;
        const pin = inSec > 0 ? `clip(t/${inSec},0,1)` : "1";
        const pout = outSec > 0 ? `clip((t-${outStart})/${outSec},0,1)` : "0";
        parts.push(`pad=${W * 3}:${H}:${W}:0:black`);
        parts.push(`crop=${W}:${H}:'${W}*${ease(pin)}+${W}*${ease(pout)}':0`);
      }
      break;
    }
    case "glitch": {
      const win = [inSec > 0 ? `lt(t,${inSec})` : "", outSec > 0 ? `gte(t,${outStart})` : ""].filter(Boolean).join("+");
      if (win) {
        parts.push(`rgbashift=rh=-${Math.round(W * 0.012)}:bh=${Math.round(W * 0.012)}:enable='${win}'`);
        parts.push(`noise=alls=45:allf=t:enable='${win}'`);
        parts.push(`eq=contrast=1.25:enable='${win}'`);
      }
      break;
    }
    case "none":
      break;
  }
  return parts.join(",");
}

/** Estado visual de transição para a prévia (CSS), em um instante relativo ao clipe. */
export function previewTransitionState(
  type: TransitionId,
  edges: ClipEdges,
  tInClip: number,
  clipDur: number,
): { overlay: string | null; overlayOpacity: number; scale: number; blurPx: number; translateX: number; glitch: boolean } {
  const idle = { overlay: null, overlayOpacity: 0, scale: 1, blurPx: 0, translateX: 0, glitch: false };
  if (type === "none") return idle;
  let p = 0; // 0 = sem efeito, 1 = efeito máximo (no corte)
  if (edges.inSec > 0 && tInClip < edges.inSec) p = 1 - tInClip / edges.inSec;
  const outStart = clipDur - edges.outSec;
  if (edges.outSec > 0 && tInClip > outStart) p = Math.max(p, (tInClip - outStart) / edges.outSec);
  if (p <= 0) return idle;
  const entering = edges.inSec > 0 && tInClip < edges.inSec;
  switch (type) {
    case "fade":
      return { ...idle, overlay: "#000", overlayOpacity: p };
    case "flash":
      return { ...idle, overlay: "#fff", overlayOpacity: p };
    case "zoom":
      return { ...idle, scale: 1 + 0.24 * p };
    case "blur":
      return { ...idle, blurPx: p > 0.5 ? 14 : 6 };
    case "light":
      return { ...idle, overlay: "#FFB061", overlayOpacity: p };
    case "slide": {
      const e = p * p * (3 - 2 * p);
      // entrando: vem da direita (+); saindo: vai para a esquerda (-)
      return { ...idle, translateX: entering ? e : -e };
    }
    case "glitch":
      return { ...idle, glitch: true };
  }
}

// ------------------------------------------------------------------
// Efeitos sonoros sintetizados (sem arquivos de terceiros: gerados pelo FFmpeg)
// ------------------------------------------------------------------

export type SfxKind = "whoosh" | "pop" | "impact";

export interface SfxEvent {
  kind: SfxKind;
  /** Instante (s, no vídeo final) em que o efeito começa. */
  at: number;
}

/** Whoosh centrado em cada transição, pop quando gancho/CTA aparecem, impacto na cartela. */
export function sfxEvents(tl: Pick<Timeline, "clips" | "transitions" | "logos" | "texts" | "audio">): SfxEvent[] {
  if (!tl.audio.sfx) return [];
  const out: SfxEvent[] = [];
  const edges = transitionEdges(tl);
  let t = 0;
  tl.clips.forEach((c, i) => {
    if (i > 0 && edges[i].inSec > 0) out.push({ kind: "whoosh", at: round3(Math.max(0, t - 0.28)) });
    t += clipDuration(c);
  });
  for (const p of placeTexts(tl)) {
    if (p.overlay.role === "hook" || p.overlay.role === "cta") out.push({ kind: "pop", at: p.start });
  }
  if (tl.logos.some((l) => l.mode === "end_card")) out.push({ kind: "impact", at: round3(clipsDuration(tl)) });
  return out.sort((a, b) => a.at - b.at).slice(0, 40);
}

/** Fonte lavfi de cada efeito (expressões constantes). */
export const SFX_SOURCES: Record<SfxKind, { src: string; dur: number }> = {
  whoosh: {
    src: "anoisesrc=d=0.56:c=pink:r=48000:a=0.9,bandpass=f=1400:width_type=o:w=2.5,afade=t=in:st=0:d=0.3:curve=exp,afade=t=out:st=0.3:d=0.26:curve=log,volume=0.55",
    dur: 0.56,
  },
  pop: {
    src: "aevalsrc='0.55*sin(2*PI*(420+1400*exp(-t*28))*t)*exp(-t*22)':d=0.18:s=48000",
    dur: 0.18,
  },
  impact: {
    src: "aevalsrc='0.9*sin(2*PI*(48+60*exp(-t*9))*t)*exp(-t*4.5)':d=0.9:s=48000,lowpass=f=400",
    dur: 0.9,
  },
};

// ------------------------------------------------------------------
// Textos animados e cartela final (ASS / libass)
// ------------------------------------------------------------------

export interface PlacedText {
  overlay: TextOverlay;
  start: number;
  end: number;
}

/** Converte a âncora de cada texto em tempos de saída, limitados aos clipes. */
export function placeTexts(tl: Pick<Timeline, "clips" | "texts">): PlacedText[] {
  const total = clipsDuration(tl);
  return tl.texts
    .map((o) => {
      const start = o.anchor === "start" ? o.offsetSec : total - o.offsetSec - o.durationSec;
      const s = Math.max(0, Math.min(total - 0.3, start));
      const e = Math.min(total, s + o.durationSec);
      return { overlay: o, start: round3(s), end: round3(e) };
    })
    .filter((p) => p.end - p.start >= 0.3);
}

/** Tempo e posição dos elementos da cartela final (compartilhado por render e prévia). */
export interface EndCardLayout {
  start: number;
  duration: number;
  logoBox: { w: number; h: number; x: number; y: number };
  headlineY: number;
  ctaY: number;
  background: { mode: "gradient" | "solid"; c0: string; c1: string };
}

export function endCardLayout(
  tl: Pick<Timeline, "clips" | "logos">,
  card: LogoConfig,
  W: number,
  H: number,
  logo: { width: number; height: number; hasAlpha: boolean; cornerColor: string | null },
): EndCardLayout {
  const hasText = Boolean(card.headline || card.cta);
  const portrait = H > W;
  const maxW = W * card.scale;
  const maxH = H * (hasText ? (portrait ? 0.3 : 0.38) : 0.5);
  const ratio = logo.width > 0 && logo.height > 0 ? logo.width / logo.height : 1;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  w = even(w);
  h = even(h);
  const centerY = hasText ? H * (portrait ? 0.42 : 0.4) : H / 2;
  const accent = card.accentColor ?? "#C9A227";
  const opaque = !logo.hasAlpha && logo.cornerColor;
  return {
    start: clipsDuration(tl),
    duration: card.durationSec,
    logoBox: { w, h, x: Math.round((W - w) / 2), y: Math.round(centerY - h / 2) },
    headlineY: Math.round(centerY + h / 2 + H * (portrait ? 0.06 : 0.08)),
    ctaY: Math.round(H * (portrait ? 0.78 : 0.84)),
    // logo com fundo próprio (sem transparência): a cartela usa a cor desse fundo
    background: opaque
      ? { mode: "solid", c0: logo.cornerColor!, c1: logo.cornerColor! }
      : { mode: "gradient", c0: card.backgroundColor, c1: mixHex(card.backgroundColor, accent, 0.35) },
  };
}

export interface OverlayAssInput {
  tl: Pick<Timeline, "clips" | "texts" | "logos" | "format" | "captions">;
  width: number;
  height: number;
  /** Cor de destaque (marca) para caixas dos textos. */
  accent: string;
  endCard?: EndCardLayout | null;
}

/** Estilos e eventos ASS para os textos animados e a cartela final. */
export function overlayAss(input: OverlayAssInput): { styles: string[]; events: string[] } {
  const { tl, width: W, height: H } = input;
  const portrait = H > W;
  const font = CAPTION_STYLES[tl.captions.style].font;
  const safe = FORMAT_PRESETS[tl.format.preset].safeArea;
  const accent = input.accent;
  const onAccent = readableOn(accent);
  const unit = portrait ? H : H * 1.35;
  const size = (r: number) => Math.round(unit * r);
  // textos da cartela legíveis sobre o fundo dela (ex.: logo com fundo dourado → cartela dourada)
  const cardBg = input.endCard?.background.mode === "solid" ? input.endCard.background.c0 : null;
  const cardText = cardBg ? readableOn(cardBg) : "#FFFFFF";
  const cardTextShadow = cardText === "#FFFFFF" ? "#000000" : "#FFFFFF";
  const ctaBox = cardBg && colorDistance(accent, cardBg) < 90 ? readableOn(cardBg) : accent;
  const ml = Math.round(safe.left * W) + Math.round(W * 0.02);
  const mr = Math.round(safe.right * W) + Math.round(W * 0.02);
  const styles = [
    `Style: OvHook,${font},${size(0.05)},${assColor(onAccent)},${assColor(onAccent)},${assColor(accent)},${assColor(accent)},-1,0,0,0,100,100,0,0,3,${size(0.012)},0,8,${ml},${mr},${Math.round(safe.top * H + H * 0.04)},1`,
    `Style: OvTitle,${font},${size(0.052)},${assColor("#FFFFFF")},${assColor("#FFFFFF")},${assColor("#000000")},${assColor("#000000", 0.45)},-1,0,0,0,100,100,0,0,1,${size(0.004)},${size(0.003)},5,${ml},${mr},0,1`,
    `Style: OvCta,${font},${size(0.038)},${assColor(onAccent)},${assColor(onAccent)},${assColor(accent)},${assColor(accent)},-1,0,0,0,100,100,0,0,3,${size(0.011)},0,2,${ml},${mr},${Math.round(safe.bottom * H + H * 0.17)},1`,
    `Style: OvLower,${font},${size(0.03)},${assColor("#FFFFFF")},${assColor("#FFFFFF")},${assColor("#111111", 0.2)},${assColor("#111111", 0.2)},-1,0,0,0,100,100,0,0,3,${size(0.01)},0,1,${ml},${mr},${Math.round(safe.bottom * H + H * 0.17)},1`,
    `Style: OvCardHead,${font},${size(0.036)},${assColor(cardText)},${assColor(cardText)},${assColor(cardTextShadow, 0.6)},${assColor(cardTextShadow, 0.6)},-1,0,0,0,100,100,1,0,1,${size(0.002)},0,5,${ml},${mr},0,1`,
    `Style: OvCardCta,${font},${size(0.032)},${assColor(readableOn(ctaBox))},${assColor(readableOn(ctaBox))},${assColor(ctaBox)},${assColor(ctaBox)},-1,0,0,0,100,100,0,0,3,${size(0.012)},0,5,${ml},${mr},0,1`,
  ];
  const events: string[] = [];
  const maxChars = portrait ? 22 : 38;
  const posOverride = (o: TextOverlay, styleAlign: number) => {
    const align = o.position === "top" ? 8 : o.position === "bottom" ? 2 : 5;
    return align === styleAlign ? "" : `\\an${align}`;
  };
  for (const p of placeTexts(tl)) {
    const o = p.overlay;
    const raw = escapeAssText(o.text);
    const text = wrapLines(o.role === "hook" || o.role === "cta" ? raw.toLocaleUpperCase("pt-BR") : raw, maxChars).join("\\N");
    const dur = Math.round((p.end - p.start) * 1000);
    const out = Math.min(250, Math.round(dur / 4));
    let style = "OvTitle";
    let anim = `\\fad(250,${out})\\fscx92\\fscy92\\t(0,300,\\fscx100\\fscy100)`;
    let align = 5;
    if (o.role === "hook") {
      style = "OvHook";
      align = 8;
      anim = `\\fad(80,${out})\\fscx70\\fscy70\\t(0,160,\\fscx108\\fscy108)\\t(160,260,\\fscx100\\fscy100)`;
    } else if (o.role === "cta") {
      style = "OvCta";
      align = 2;
      anim = `\\fad(80,${out})\\fscx75\\fscy75\\t(0,180,\\fscx106\\fscy106)\\t(180,300,\\fscx100\\fscy100)`;
    } else if (o.role === "lower_third") {
      style = "OvLower";
      align = 1;
      anim = `\\fad(300,${out})`;
    }
    events.push(`Dialogue: 2,${assTime(p.start)},${assTime(p.end)},${style},,0,0,0,,{${posOverride(o, align)}${anim}}${text}`);
  }
  const card = tl.logos.find((l) => l.mode === "end_card");
  if (card && input.endCard) {
    const ec = input.endCard;
    const end = ec.start + ec.duration;
    if (card.headline) {
      const t0 = ec.start + Math.min(0.35, ec.duration * 0.15);
      const text = wrapLines(escapeAssText(card.headline), maxChars + 6).join("\\N");
      events.push(
        `Dialogue: 3,${assTime(t0)},${assTime(end)},OvCardHead,,0,0,0,,{\\an5\\move(${Math.round(W / 2)},${ec.headlineY + Math.round(H * 0.03)},${Math.round(W / 2)},${ec.headlineY},0,400)\\fad(400,0)}${text}`,
      );
    }
    if (card.cta) {
      const t0 = ec.start + Math.min(0.75, ec.duration * 0.3);
      const text = escapeAssText(card.cta).toLocaleUpperCase("pt-BR");
      events.push(
        `Dialogue: 3,${assTime(t0)},${assTime(end)},OvCardCta,,0,0,0,,{\\an5\\pos(${Math.round(W / 2)},${ec.ctaY})\\fad(200,0)\\fscx70\\fscy70\\t(0,200,\\fscx108\\fscy108)\\t(200,320,\\fscx100\\fscy100)}${text}`,
      );
    }
  }
  return { styles, events };
}

// ------------------------------------------------------------------
// utilitários
// ------------------------------------------------------------------

function even(v: number): number {
  return Math.max(2, Math.round(v / 2) * 2);
}

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function parseHex(h: string): [number, number, number] {
  const n = /^#[0-9a-fA-F]{6}$/.test(h) ? parseInt(h.slice(1), 16) : 0x0b0b0c;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colorDistance(a: string, b: string): number {
  const pa = parseHex(a);
  const pb = parseHex(b);
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
}


function assTime(t: number): string {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const r = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(r).padStart(2, "0")}`;
}

/**
 * Arquivo ASS completo: legendas (se ativadas) + textos animados + textos da cartela.
 * Retorna null quando não há nada para desenhar.
 */
export function buildAssFile(
  tl: Timeline,
  cues: OutputCue[],
  opts: { width: number; height: number; accent: string; endCard: EndCardLayout | null },
): string | null {
  const overlay = overlayAss({ tl, width: opts.width, height: opts.height, accent: opts.accent, endCard: opts.endCard });
  const captionCuesUsed = tl.captions.enabled ? cues : [];
  if (!captionCuesUsed.length && !overlay.events.length) return null;
  const base = toAss(tl, captionCuesUsed, { width: opts.width, height: opts.height });
  const lines = base.split("\n");
  const eventsAt = lines.indexOf("[Events]");
  const styles = lines.slice(0, eventsAt - 1);
  const rest = lines.slice(eventsAt - 1);
  return [...styles, ...overlay.styles, ...rest.slice(0, -1), ...overlay.events, ""].join("\n");
}
