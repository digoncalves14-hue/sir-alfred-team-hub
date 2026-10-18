import { z } from "zod";

/**
 * Presets de formato por plataforma. Os requisitos das redes mudam com o tempo,
 * por isso tudo aqui é configuração (não lógica): ajuste os valores sem tocar
 * no motor de renderização.
 */
export const FORMAT_PRESET_IDS = [
  "youtube_16x9",
  "youtube_shorts_9x16",
  "instagram_reels_9x16",
  "instagram_feed_4x5",
  "instagram_feed_1x1",
  "instagram_stories_9x16",
  "facebook_reels_9x16",
  "facebook_feed_1x1",
  "facebook_feed_4x5",
] as const;

export const FormatPresetId = z.enum(FORMAT_PRESET_IDS);
export type FormatPresetId = z.infer<typeof FormatPresetId>;

export interface SafeArea {
  /** Frações (0..1) da altura/largura reservadas pela interface da rede social. */
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface FormatPreset {
  id: FormatPresetId;
  label: string;
  platform: "youtube" | "instagram" | "facebook";
  aspect: { w: number; h: number };
  maxDurationSec: number | null;
  recommendedDurationSec?: number;
  safeArea: SafeArea;
}

const vertical: SafeArea = { top: 0.12, bottom: 0.22, left: 0.06, right: 0.14 };
const none: SafeArea = { top: 0.05, bottom: 0.08, left: 0.05, right: 0.05 };
const feed: SafeArea = { top: 0.06, bottom: 0.1, left: 0.06, right: 0.06 };

export const FORMAT_PRESETS: Record<FormatPresetId, FormatPreset> = {
  youtube_16x9: {
    id: "youtube_16x9",
    label: "YouTube Horizontal (16:9)",
    platform: "youtube",
    aspect: { w: 16, h: 9 },
    maxDurationSec: null,
    safeArea: none,
  },
  youtube_shorts_9x16: {
    id: "youtube_shorts_9x16",
    label: "YouTube Shorts (9:16)",
    platform: "youtube",
    aspect: { w: 9, h: 16 },
    maxDurationSec: 180,
    recommendedDurationSec: 45,
    safeArea: vertical,
  },
  instagram_reels_9x16: {
    id: "instagram_reels_9x16",
    label: "Instagram Reels (9:16)",
    platform: "instagram",
    aspect: { w: 9, h: 16 },
    maxDurationSec: 180,
    recommendedDurationSec: 30,
    safeArea: vertical,
  },
  instagram_feed_4x5: {
    id: "instagram_feed_4x5",
    label: "Instagram Feed (4:5)",
    platform: "instagram",
    aspect: { w: 4, h: 5 },
    maxDurationSec: 3600,
    safeArea: feed,
  },
  instagram_feed_1x1: {
    id: "instagram_feed_1x1",
    label: "Instagram Feed (1:1)",
    platform: "instagram",
    aspect: { w: 1, h: 1 },
    maxDurationSec: 3600,
    safeArea: feed,
  },
  instagram_stories_9x16: {
    id: "instagram_stories_9x16",
    label: "Instagram Stories (9:16)",
    platform: "instagram",
    aspect: { w: 9, h: 16 },
    maxDurationSec: 60,
    recommendedDurationSec: 15,
    safeArea: vertical,
  },
  facebook_reels_9x16: {
    id: "facebook_reels_9x16",
    label: "Facebook Reels (9:16)",
    platform: "facebook",
    aspect: { w: 9, h: 16 },
    maxDurationSec: 90,
    recommendedDurationSec: 30,
    safeArea: vertical,
  },
  facebook_feed_1x1: {
    id: "facebook_feed_1x1",
    label: "Facebook Feed (1:1)",
    platform: "facebook",
    aspect: { w: 1, h: 1 },
    maxDurationSec: null,
    safeArea: feed,
  },
  facebook_feed_4x5: {
    id: "facebook_feed_4x5",
    label: "Facebook Feed (4:5)",
    platform: "facebook",
    aspect: { w: 4, h: 5 },
    maxDurationSec: null,
    safeArea: feed,
  },
};

export const RESOLUTIONS = ["720p", "1080p", "2160p"] as const;
export const Resolution = z.enum(RESOLUTIONS);
export type Resolution = z.infer<typeof Resolution>;

const SHORT_SIDE: Record<Resolution, number> = { "720p": 720, "1080p": 1080, "2160p": 2160 };

/** Dimensões finais (pares, exigência do H.264 yuv420p) para um preset e resolução. */
export function outputDimensions(preset: FormatPresetId, resolution: Resolution): { width: number; height: number } {
  const { aspect } = FORMAT_PRESETS[preset];
  const short = SHORT_SIDE[resolution];
  let width: number;
  let height: number;
  if (aspect.w >= aspect.h) {
    height = short;
    width = Math.round((short * aspect.w) / aspect.h);
  } else {
    width = short;
    height = Math.round((short * aspect.h) / aspect.w);
  }
  return { width: even(width), height: even(height) };
}

/**
 * 4K só é permitido quando a origem tem resolução suficiente (lado menor >= 1440).
 * Evita "upscale" enganoso que só aumenta o arquivo.
 */
export function resolutionAllowed(resolution: Resolution, sourceWidth: number, sourceHeight: number): boolean {
  if (resolution !== "2160p") return true;
  return Math.min(sourceWidth, sourceHeight) >= 1440;
}

export function even(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r + 1;
}

export const DESTINATIONS = {
  youtube: ["youtube_16x9", "youtube_shorts_9x16"],
  instagram: ["instagram_reels_9x16", "instagram_feed_4x5", "instagram_feed_1x1", "instagram_stories_9x16"],
  facebook: ["facebook_reels_9x16", "facebook_feed_1x1", "facebook_feed_4x5"],
} as const satisfies Record<string, readonly FormatPresetId[]>;
