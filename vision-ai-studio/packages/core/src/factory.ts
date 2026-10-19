import type { FormatPresetId } from "./presets";
import { getStyle } from "./styles";
import { type Timeline, newClipId, parseTimeline } from "./timeline";

export interface FactoryAsset {
  id: string;
  durationSec: number;
  fps: number | null;
}

/** Timeline inicial: todos os vídeos enviados, em sequência, sem cortes. */
export function initialTimeline(
  assets: FactoryAsset[],
  preset: FormatPresetId,
  opts: { brandId?: string | null; styleId?: string | null } = {},
): Timeline {
  const style = getStyle(opts.styleId);
  const fps = Math.min(60, Math.max(24, Math.round(assets.find((a) => a.fps)?.fps ?? 30)));
  return parseTimeline({
    format: { preset, fps: fps > 50 ? 60 : fps >= 29 ? 30 : fps, reframe: style.reframe },
    clips: assets
      .filter((a) => a.durationSec > 0)
      .map((a) => ({ id: newClipId(), assetId: a.id, sourceStart: 0, sourceEnd: a.durationSec })),
    captions: { style: style.captionStyle },
    styleId: style.id,
    brandId: opts.brandId ?? null,
  });
}
