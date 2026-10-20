import { z } from "zod";

export const CAPTION_STYLE_IDS = [
  "premium_minimal",
  "dynamic",
  "highlight_word",
  "educational",
  "kids_colorful",
  "commercial",
  "reels_pop",
  "marker",
] as const;
export const CaptionStyleId = z.enum(CAPTION_STYLE_IDS);
export type CaptionStyleId = z.infer<typeof CaptionStyleId>;

export interface CaptionStyle {
  id: CaptionStyleId;
  label: string;
  /** Fonte instalada no worker (ver Dockerfile). Lista fechada: nunca vem do usuário. */
  font: string;
  /** Tamanho base em fração da altura do vídeo. */
  sizeRatio: number;
  bold: boolean;
  uppercase: boolean;
  primary: string;
  highlight: string;
  outline: string;
  outlineWidthRatio: number;
  /** Caixa de fundo atrás do texto. */
  box: boolean;
  boxColor: string;
  boxAlpha: number;
  maxCharsPerLine: number;
  maxWordsPerBlock: number;
  /** Uma palavra destacada por vez (karaokê). */
  wordHighlight: boolean;
  /** Animação discreta de entrada (fade). */
  fadeMs: number;
  /** A palavra falada "salta" (escala) ao ser destacada. */
  wordPop?: boolean;
  /** A palavra falada ganha um marca-texto colorido (contorno grosso na cor de destaque). */
  wordMarker?: boolean;
}

export const CAPTION_STYLES: Record<CaptionStyleId, CaptionStyle> = {
  premium_minimal: {
    id: "premium_minimal",
    label: "Premium minimalista",
    font: "Montserrat",
    sizeRatio: 0.042,
    bold: false,
    uppercase: false,
    primary: "#FFFFFF",
    highlight: "#D4AF37",
    outline: "#000000",
    outlineWidthRatio: 0.0016,
    box: false,
    boxColor: "#000000",
    boxAlpha: 0,
    maxCharsPerLine: 30,
    maxWordsPerBlock: 6,
    wordHighlight: false,
    fadeMs: 120,
  },
  dynamic: {
    id: "dynamic",
    label: "Legenda dinâmica",
    font: "Montserrat",
    sizeRatio: 0.055,
    bold: true,
    uppercase: true,
    primary: "#FFFFFF",
    highlight: "#FFD54A",
    outline: "#000000",
    outlineWidthRatio: 0.003,
    box: false,
    boxColor: "#000000",
    boxAlpha: 0,
    maxCharsPerLine: 18,
    maxWordsPerBlock: 3,
    wordHighlight: false,
    fadeMs: 60,
  },
  highlight_word: {
    id: "highlight_word",
    label: "Palavra destacada",
    font: "Montserrat",
    sizeRatio: 0.052,
    bold: true,
    uppercase: true,
    primary: "#FFFFFF",
    highlight: "#D4AF37",
    outline: "#000000",
    outlineWidthRatio: 0.003,
    box: false,
    boxColor: "#000000",
    boxAlpha: 0,
    maxCharsPerLine: 20,
    maxWordsPerBlock: 4,
    wordHighlight: true,
    fadeMs: 0,
  },
  educational: {
    id: "educational",
    label: "Educacional",
    font: "Open Sans",
    sizeRatio: 0.04,
    bold: true,
    uppercase: false,
    primary: "#FFFFFF",
    highlight: "#7FD1FF",
    outline: "#000000",
    outlineWidthRatio: 0,
    box: true,
    boxColor: "#101014",
    boxAlpha: 0.72,
    maxCharsPerLine: 34,
    maxWordsPerBlock: 8,
    wordHighlight: false,
    fadeMs: 100,
  },
  kids_colorful: {
    id: "kids_colorful",
    label: "Infantil colorida",
    font: "Fredoka",
    sizeRatio: 0.056,
    bold: true,
    uppercase: false,
    primary: "#FFF6D5",
    highlight: "#FF6FB5",
    outline: "#3B1F7A",
    outlineWidthRatio: 0.0045,
    box: false,
    boxColor: "#000000",
    boxAlpha: 0,
    maxCharsPerLine: 20,
    maxWordsPerBlock: 4,
    wordHighlight: true,
    fadeMs: 120,
  },
  commercial: {
    id: "commercial",
    label: "Comercial",
    font: "Montserrat",
    sizeRatio: 0.048,
    bold: true,
    uppercase: true,
    primary: "#111111",
    highlight: "#B8860B",
    outline: "#000000",
    outlineWidthRatio: 0,
    box: true,
    boxColor: "#F5F1E6",
    boxAlpha: 0.95,
    maxCharsPerLine: 24,
    maxWordsPerBlock: 5,
    wordHighlight: false,
    fadeMs: 80,
  },
  reels_pop: {
    id: "reels_pop",
    label: "Reels pop (palavra salta)",
    font: "Montserrat",
    sizeRatio: 0.06,
    bold: true,
    uppercase: true,
    primary: "#FFFFFF",
    highlight: "#FFD54A",
    outline: "#000000",
    outlineWidthRatio: 0.0045,
    box: false,
    boxColor: "#000000",
    boxAlpha: 0,
    maxCharsPerLine: 16,
    maxWordsPerBlock: 3,
    wordHighlight: true,
    fadeMs: 0,
    wordPop: true,
  },
  marker: {
    id: "marker",
    label: "Marca-texto",
    font: "Montserrat",
    sizeRatio: 0.052,
    bold: true,
    uppercase: true,
    primary: "#FFFFFF",
    highlight: "#C9A227",
    outline: "#000000",
    outlineWidthRatio: 0.0035,
    box: false,
    boxColor: "#000000",
    boxAlpha: 0,
    maxCharsPerLine: 18,
    maxWordsPerBlock: 4,
    wordHighlight: true,
    fadeMs: 0,
    wordMarker: true,
  },
};
