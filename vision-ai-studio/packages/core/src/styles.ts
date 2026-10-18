import type { CaptionStyleId } from "./caption-styles";

export const EDIT_STYLE_IDS = [
  "cinematic",
  "premium",
  "reels_dynamic",
  "educational",
  "product_commercial",
  "kids_fun",
  "interview_podcast",
  "workshop_training",
] as const;
export type EditStyleId = (typeof EDIT_STYLE_IDS)[number];

/**
 * Estilos automáticos. Cada estilo é um conjunto de parâmetros concretos que o
 * motor realmente usa (ritmo de cortes, legenda, reenquadramento, música).
 * Na Fase 1 não há transições/efeitos visuais: os estilos não prometem isso.
 */
export interface EditStyle {
  id: EditStyleId;
  label: string;
  description: string;
  captionStyle: CaptionStyleId;
  /** Duração mínima/máxima de cada trecho escolhido na montagem automática. */
  minClipSec: number;
  maxClipSec: number;
  /** Silêncio mínimo a ser removido. */
  silenceThresholdSec: number;
  /** Peso relativo de movimento x fala na pontuação de trechos. */
  motionWeight: number;
  speechWeight: number;
  reframe: "fill" | "fit_blur";
  musicVolume: number;
}

export const EDIT_STYLES: Record<EditStyleId, EditStyle> = {
  cinematic: {
    id: "cinematic",
    label: "Cinematográfico",
    description: "Trechos mais longos, ritmo calmo, legenda discreta.",
    captionStyle: "premium_minimal",
    minClipSec: 3,
    maxClipSec: 8,
    silenceThresholdSec: 1.5,
    motionWeight: 0.6,
    speechWeight: 0.4,
    reframe: "fit_blur",
    musicVolume: 0.35,
  },
  premium: {
    id: "premium",
    label: "Premium e elegante",
    description: "Ritmo equilibrado, legenda minimalista e acabamento sóbrio.",
    captionStyle: "premium_minimal",
    minClipSec: 2.5,
    maxClipSec: 6,
    silenceThresholdSec: 1,
    motionWeight: 0.5,
    speechWeight: 0.5,
    reframe: "fill",
    musicVolume: 0.28,
  },
  reels_dynamic: {
    id: "reels_dynamic",
    label: "Dinâmico para Reels",
    description: "Cortes curtos, sem pausas, legenda grande e chamativa.",
    captionStyle: "dynamic",
    minClipSec: 1.2,
    maxClipSec: 3.5,
    silenceThresholdSec: 0.5,
    motionWeight: 0.6,
    speechWeight: 0.4,
    reframe: "fill",
    musicVolume: 0.3,
  },
  educational: {
    id: "educational",
    label: "Educacional",
    description: "Preserva frases completas, legenda legível com fundo.",
    captionStyle: "educational",
    minClipSec: 4,
    maxClipSec: 15,
    silenceThresholdSec: 0.9,
    motionWeight: 0.2,
    speechWeight: 0.8,
    reframe: "fit_blur",
    musicVolume: 0.12,
  },
  product_commercial: {
    id: "product_commercial",
    label: "Comercial de produto",
    description: "Prioriza movimento e demonstração; legenda comercial.",
    captionStyle: "commercial",
    minClipSec: 1.5,
    maxClipSec: 4,
    silenceThresholdSec: 0.7,
    motionWeight: 0.75,
    speechWeight: 0.25,
    reframe: "fill",
    musicVolume: 0.35,
  },
  kids_fun: {
    id: "kids_fun",
    label: "Infantil e divertido",
    description: "Ritmo alegre, legenda colorida com palavra destacada.",
    captionStyle: "kids_colorful",
    minClipSec: 1.5,
    maxClipSec: 4,
    silenceThresholdSec: 0.7,
    motionWeight: 0.6,
    speechWeight: 0.4,
    reframe: "fill",
    musicVolume: 0.35,
  },
  interview_podcast: {
    id: "interview_podcast",
    label: "Entrevista ou podcast",
    description: "Foco na fala, remove pausas longas, mantém frases inteiras.",
    captionStyle: "highlight_word",
    minClipSec: 5,
    maxClipSec: 25,
    silenceThresholdSec: 0.8,
    motionWeight: 0.1,
    speechWeight: 0.9,
    reframe: "fill",
    musicVolume: 0.1,
  },
  workshop_training: {
    id: "workshop_training",
    label: "Workshop e treinamento",
    description: "Trechos explicativos longos, legenda educacional.",
    captionStyle: "educational",
    minClipSec: 6,
    maxClipSec: 30,
    silenceThresholdSec: 1.2,
    motionWeight: 0.3,
    speechWeight: 0.7,
    reframe: "fit_blur",
    musicVolume: 0.1,
  },
};

export function getStyle(id: string | undefined | null): EditStyle {
  return (id && (EDIT_STYLES as Record<string, EditStyle>)[id]) || EDIT_STYLES.premium;
}
