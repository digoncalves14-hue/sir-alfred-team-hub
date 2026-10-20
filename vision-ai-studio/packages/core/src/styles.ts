import type { CaptionStyleId } from "./caption-styles";
import type { LookId, TransitionId } from "./timeline";

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
 * Cada estilo também define o acabamento: transição, tratamento de cor e zoom dinâmico.
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
  transition: TransitionId;
  transitionSec: number;
  look: LookId;
  dynamicZoom: boolean;
  sfx: boolean;
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
    transition: "fade",
    transitionSec: 0.6,
    look: "cinematic",
    dynamicZoom: false,
    sfx: false,
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
    transition: "fade",
    transitionSec: 0.4,
    look: "clean",
    dynamicZoom: false,
    sfx: false,
  },
  reels_dynamic: {
    id: "reels_dynamic",
    label: "Dinâmico para Reels",
    description: "Cortes curtos, sem pausas, legenda grande e chamativa.",
    captionStyle: "reels_pop",
    minClipSec: 1.2,
    maxClipSec: 3.5,
    silenceThresholdSec: 0.5,
    motionWeight: 0.6,
    speechWeight: 0.4,
    reframe: "fill",
    musicVolume: 0.3,
    transition: "zoom",
    transitionSec: 0.35,
    look: "vibrant",
    dynamicZoom: true,
    sfx: true,
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
    transition: "none",
    transitionSec: 0.4,
    look: "clean",
    dynamicZoom: false,
    sfx: false,
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
    transition: "flash",
    transitionSec: 0.3,
    look: "vibrant",
    dynamicZoom: true,
    sfx: true,
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
    transition: "zoom",
    transitionSec: 0.35,
    look: "vibrant",
    dynamicZoom: true,
    sfx: true,
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
    transition: "none",
    transitionSec: 0.4,
    look: "clean",
    dynamicZoom: true,
    sfx: false,
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
    transition: "fade",
    transitionSec: 0.4,
    look: "clean",
    dynamicZoom: false,
    sfx: false,
  },
};

export function getStyle(id: string | undefined | null): EditStyle {
  return (id && (EDIT_STYLES as Record<string, EditStyle>)[id]) || EDIT_STYLES.premium;
}
