import { describe, expect, it } from "vitest";
import { computeActivity, invertIntervals, parseFfprobe, parseSceneCuts, parseSilenceDetect, weightedFocus } from "../src/analysis";

describe("análise técnica", () => {
  it("interpreta silencedetect, inclusive silêncio aberto no fim", () => {
    const stderr = `[silencedetect @ 0x1] silence_start: 1.5\n[silencedetect @ 0x1] silence_end: 3.25 | silence_duration: 1.75\n[silencedetect @ 0x1] silence_start: 9`;
    expect(parseSilenceDetect(stderr, 10)).toEqual([
      { start: 1.5, end: 3.25 },
      { start: 9, end: 10 },
    ]);
  });

  it("interpreta trocas de cena do showinfo", () => {
    const s = "[Parsed_showinfo_3 @ 0x] n:0 pts:1 pts_time:4.5 duration\n[Parsed_showinfo_3 @ 0x] n:1 pts_time:12.25 ";
    expect(parseSceneCuts(s)).toEqual([4.5, 12.25]);
  });

  it("ffprobe: considera rotação do celular", () => {
    const p = parseFfprobe({
      streams: [
        { codec_type: "video", codec_name: "h264", width: 1920, height: 1080, avg_frame_rate: "30000/1001", side_data_list: [{ rotation: -90 }] },
        { codec_type: "audio", codec_name: "aac" },
      ],
      format: { duration: "12.5", format_name: "mov,mp4", size: "1000" },
    });
    expect(p).toMatchObject({ width: 1080, height: 1920, fps: 29.97, hasAudio: true, rotation: 270, durationSec: 12.5 });
  });

  it("movimento: centroide segue a região que muda", () => {
    const w = 8, h = 4;
    const frames = new Uint8Array(w * h * 3);
    // quadro 2: pixels da direita mudam
    for (let y = 0; y < h; y++) for (let x = 6; x < 8; x++) frames[w * h + y * w + x] = 200;
    const a = computeActivity(frames, w, h, 2);
    expect(a.motion[1]).toBeGreaterThan(0);
    expect(a.centroidX[1]).toBeGreaterThan(0.8);
    expect(weightedFocus(a, 0, 1.5)?.x).toBeGreaterThan(0.8);
  });

  it("inverte intervalos", () => {
    expect(invertIntervals([{ start: 2, end: 3 }], 5)).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ]);
  });
});
