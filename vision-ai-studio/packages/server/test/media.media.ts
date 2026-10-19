import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyEditPlan,
  buildAssFile,
  buildCaptionBlocks,
  buildRenderCommand,
  captionCues,
  endCardLayout,
  parseTimeline,
  toAss,
  type AssetAnalysis,
  type MediaProbe,
  type Timeline,
} from "@vision/core";
import { analyzeFile, analyzeMusic, createPreviewProxy, ffmpeg, probeFile } from "../src/node";
import { ProcessingError } from "../src/errors";
import { makeFixtures } from "../../../scripts/make-fixtures";

const A = "11111111-1111-4111-8111-111111111111";
const LOGO = "33333333-3333-4333-8333-333333333333";
const MUSIC = "44444444-4444-4444-8444-444444444444";

let dir: string;
let files: Record<string, string>;
let probe: MediaProbe;
let analysis: AssetAnalysis;

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgres://unused";
  dir = await mkdtemp(path.join(os.tmpdir(), "vision-media-"));
  files = await makeFixtures(dir);
  probe = await probeFile(files.horizontal);
  analysis = await analyzeFile(files.horizontal, probe);
});

afterAll(async () => {
  if (!process.env.KEEP_MEDIA_DIR) await rm(dir, { recursive: true, force: true });
  else console.log("MEDIA_DIR=" + dir);
});

async function render(tl: Timeline, name: string, extra: { ass?: string; resolution?: "720p" | "1080p"; logoAlpha?: boolean } = {}) {
  const out = path.join(dir, `${name}.mp4`);
  const graph = path.join(dir, `${name}.txt`);
  const cmd = buildRenderCommand(
    tl,
    {
      assets: new Map([[A, { path: files.horizontal, width: 1280, height: 720, hasAudio: true, hasVideo: true, duration: probe.durationSec }]]),
      images: new Map([[LOGO, files.logo]]),
      audios: new Map([[MUSIC, files.music]]),
      assPath: extra.ass ?? null,
      fontsDir: null,
      logoMeta: new Map([[LOGO, { width: 400, height: 200, hasAlpha: extra.logoAlpha ?? false, cornerColor: extra.logoAlpha ? null : "#D4AF37" }]]),
    },
    { resolution: extra.resolution ?? "720p", encoderPreset: "ultrafast" },
    out,
    graph,
  );
  await writeFile(graph, cmd.filterGraph);
  const progress: number[] = [];
  await ffmpeg(cmd.args, { expectedDurationSec: cmd.durationSec, onProgress: (p) => progress.push(p) });
  const p = await probeFile(out);
  return { out, probe: p, progress, cmd };
}

function base(over: Partial<Timeline> = {}): Timeline {
  return parseTimeline({
    format: { preset: "youtube_16x9", fps: 30, reframe: "fill" },
    clips: [{ id: "c0", assetId: A, sourceStart: 0, sourceEnd: probe.durationSec }],
    ...over,
  });
}

async function frameAt(file: string, t: number, crop: string): Promise<Buffer> {
  const { stdout } = await ffmpeg(
    ["-hide_banner", "-nostdin", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", `crop=${crop},scale=64:16,format=gray`, "-f", "rawvideo", "pipe:1"],
    { captureStdout: true },
  );
  return stdout;
}

describe("processamento real com FFmpeg", () => {
  it("lê metadados do vídeo (critério 1)", () => {
    expect(probe).toMatchObject({ width: 1280, height: 720, hasAudio: true, hasVideo: true });
    expect(probe.durationSec).toBeCloseTo(20, 0);
  });

  it("detecta silêncios e movimento reais", () => {
    expect(analysis.silences.some((s) => Math.abs(s.start - 4) < 0.3 && Math.abs(s.end - 7) < 0.3)).toBe(true);
    expect(analysis.silences.some((s) => Math.abs(s.start - 13) < 0.3)).toBe(true);
    const act = analysis.activity!;
    const firstHalf = act.motion.slice(2, 18).reduce((a, b) => a + b, 0);
    const secondHalf = act.motion.slice(22, 38).reduce((a, b) => a + b, 0);
    expect(secondHalf).toBeGreaterThan(firstHalf);
  });

  it("exporta somente o trecho selecionado (critério 2)", async () => {
    const tl = applyEditPlan(base(), { reply: "", operations: [{ op: "keep_range", start: 5, end: 12 }] }, { sources: new Map(), brand: null, musicAssetIds: [] }).timeline;
    const r = await render(tl, "trecho");
    expect(r.probe.durationSec).toBeGreaterThan(6.85);
    expect(r.probe.durationSec).toBeLessThan(7.15);
    expect(r.probe.videoCodec).toBe("h264");
    expect(r.probe.audioCodec).toBe("aac");
    expect(r.progress.at(-1)).toBe(1);
  });

  it("converte horizontal para vertical 9:16 com foco no movimento (critério 4)", async () => {
    const sources = new Map([[A, { assetId: A, duration: probe.durationSec, analysis, transcript: null }]]);
    const tl = applyEditPlan(
      base({ clips: [{ id: "c0", assetId: A, sourceStart: 16, sourceEnd: 19.5 }] as never }),
      { reply: "", operations: [{ op: "set_format", preset: "instagram_reels_9x16" }] },
      { sources, brand: null, musicAssetIds: [] },
    ).timeline;
    expect(tl.clips[0].focusSource).toBe("auto_motion");
    expect(tl.clips[0].focusX!).toBeGreaterThan(0.58); // objeto em x≈680-920 de 1280
    const r = await render(tl, "vertical");
    expect(r.probe.width).toBe(720);
    expect(r.probe.height).toBe(1280);
  });

  it("incorpora legendas sincronizadas no vídeo (critério 3, com transcrição de teste)", async () => {
    const transcript = {
      language: "pt",
      text: "Olá, bem-vindo à barbearia.",
      words: [
        { text: "Olá,", start: 0.5, end: 1 },
        { text: "bem-vindo", start: 1.1, end: 1.8 },
        { text: "à", start: 1.85, end: 2 },
        { text: "barbearia.", start: 2.05, end: 3 },
      ],
      segments: [{ text: "Olá, bem-vindo à barbearia.", start: 0.5, end: 3 }],
    };
    const tl = base({
      clips: [{ id: "c0", assetId: A, sourceStart: 0, sourceEnd: 4 }] as never,
      captions: { enabled: true, style: "educational", position: "bottom", fontScale: 1.4, blocks: buildCaptionBlocks(transcript, A, "educational") },
    });
    const ass = path.join(dir, "leg.ass");
    await writeFile(ass, toAss(tl, captionCues(tl), { width: 1280, height: 720 }));
    const withCaps = await render(tl, "legendado", { ass });
    const without = await render(base({ clips: [{ id: "c0", assetId: A, sourceStart: 0, sourceEnd: 4 }] as never }), "sem-legenda");
    const crop = "1280:160:0:520"; // faixa inferior onde a legenda aparece
    const a = await frameAt(withCaps.out, 2, crop);
    const b = await frameAt(without.out, 2, crop);
    const diff = a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
    expect(diff).toBeGreaterThan(3);
    // antes da fala não há legenda
    const a0 = await frameAt(withCaps.out, 0.2, crop);
    const b0 = await frameAt(without.out, 0.2, crop);
    expect(a0.reduce((s, v, i) => s + Math.abs(v - b0[i]), 0) / a0.length).toBeLessThan(1.5);
  });

  it("renderiza cartela final com logo, música com ducking, fundo desfocado e zoom", async () => {
    const tl = base({
      format: { preset: "instagram_feed_4x5", fps: 30, reframe: "fit_blur" },
      clips: [
        { id: "c0", assetId: A, sourceStart: 0, sourceEnd: 3 },
        { id: "c1", assetId: A, sourceStart: 10, sourceEnd: 13, zoom: 1.5 },
      ] as never,
      logos: [{ assetId: LOGO, mode: "end_card", durationSec: 2, position: "top_right", backgroundColor: "#0B0B0C", scale: 0.4 }],
      audio: { originalVolume: 1, normalize: true, denoise: true, music: { assetId: MUSIC, volume: 0.3, ducking: true, fadeInSec: 0.5, fadeOutSec: 1 } },
    });
    const r = await render(tl, "completo");
    expect(r.probe.durationSec).toBeGreaterThan(7.8);
    expect(r.probe.durationSec).toBeLessThan(8.2);
    expect(r.probe.width).toBe(720);
    expect(r.probe.height).toBe(900);
  });

  it("transições nos cortes mantêm a duração (fade, flash, zoom, desfoque) e o flash clareia o corte", async () => {
    const clips = [
      { id: "c0", assetId: A, sourceStart: 0, sourceEnd: 2 },
      { id: "c1", assetId: A, sourceStart: 6, sourceEnd: 8 },
      { id: "c2", assetId: A, sourceStart: 12, sourceEnd: 14 },
    ];
    for (const type of ["fade", "flash", "zoom", "blur"] as const) {
      const tl = base({ clips: clips as never, transitions: { type, durationSec: 0.5 }, look: "cinematic" });
      const r = await render(tl, `transicao-${type}`);
      expect(r.probe.durationSec, type).toBeGreaterThan(5.9);
      expect(r.probe.durationSec, type).toBeLessThan(6.15);
      if (type === "flash") {
        const atCut = await frameAt(r.out, 1.98, "1280:720:0:0");
        const mid = await frameAt(r.out, 1.0, "1280:720:0:0");
        const avg = (b: Buffer) => b.reduce((a, v) => a + v, 0) / b.length;
        expect(avg(atCut)).toBeGreaterThan(avg(mid) + 40);
      }
    }
  }, 240_000);

  it("textos animados, zoom dinâmico e cartela animada (degradê e logo opaca) renderizam juntos", async () => {
    const engineCtx = { sources: new Map(), brand: null, musicAssetIds: [] };
    const tl0 = base({
      clips: [{ id: "c0", assetId: A, sourceStart: 0, sourceEnd: 8 }] as never,
      transitions: { type: "zoom", durationSec: 0.4 },
      logos: [{ assetId: LOGO, mode: "end_card", durationSec: 3, position: "top_right", backgroundColor: "#0B0B0C", scale: 0.5, accentColor: "#C9A227", headline: "Formação profissional", cta: "Inscreva-se já" }],
    });
    const { timeline: tl } = applyEditPlan(
      tl0,
      {
        reply: "",
        operations: [
          { op: "dynamic_zoom", enabled: true, intensity: 0.15 },
          { op: "add_text", text: "Você está cortando errado?", role: "hook", anchor: "start", offset_sec: 0, duration_sec: 2.5, position: null },
          { op: "add_text", text: "Garanta sua vaga", role: "cta", anchor: "end", offset_sec: 0, duration_sec: 2, position: null },
        ],
      },
      engineCtx,
    );
    expect(tl.clips.length).toBeGreaterThan(1);
    expect(tl.clips.some((c) => c.punch && c.zoom > 1.1)).toBe(true);
    const card = tl.logos[0];
    for (const alpha of [false, true]) {
      const ass = buildAssFile(tl, [], {
        width: 1280,
        height: 720,
        accent: "#C9A227",
        endCard: endCardLayout(tl, card, 1280, 720, { width: 400, height: 200, hasAlpha: alpha, cornerColor: alpha ? null : "#D4AF37" }),
      });
      expect(ass).toContain("VOCÊ ESTÁ CORTANDO ERRADO?");
      expect(ass).toContain("INSCREVA-SE JÁ");
      const assPath = path.join(dir, `textos-${alpha}.ass`);
      await writeFile(assPath, ass!);
      const r = await render(tl, `acabamento-${alpha}`, { ass: assPath, logoAlpha: alpha });
      expect(r.probe.durationSec).toBeGreaterThan(10.9);
      expect(r.probe.durationSec).toBeLessThan(11.2);
    }
  }, 240_000);

  it("vídeo sem áudio recebe trilha silenciosa", async () => {
    const out = path.join(dir, "mudo-out.mp4");
    const graph = path.join(dir, "mudo.txt");
    const p = await probeFile(files.noAudio);
    const B = "55555555-5555-4555-8555-555555555555";
    const tl = parseTimeline({ format: { preset: "instagram_feed_1x1", fps: 25 }, clips: [{ id: "x", assetId: B, sourceStart: 0, sourceEnd: 3 }] });
    const cmd = buildRenderCommand(tl, { assets: new Map([[B, { path: files.noAudio, width: p.width!, height: p.height!, hasAudio: false, hasVideo: true, duration: p.durationSec }]]), images: new Map(), audios: new Map(), assPath: null, fontsDir: null }, { resolution: "720p", encoderPreset: "ultrafast" }, out, graph);
    await writeFile(graph, cmd.filterGraph);
    await ffmpeg(cmd.args);
    const o = await probeFile(out);
    expect(o.hasAudio).toBe(true);
    expect(o.width).toBe(720);
  });

  it("detecta o andamento de uma música real (120 BPM)", async () => {
    const m = await analyzeMusic(files.beat, 20);
    expect(m.bpm).toBeGreaterThan(116);
    expect(m.bpm).toBeLessThan(124);
    // batidas alinhadas à grade de 0,5 s
    const offs = m.beats.slice(2, 12).map((b) => Math.abs(((b + 0.25) % 0.5) - 0.25));
    expect(Math.max(...offs)).toBeLessThan(0.08);
    const sine = await analyzeMusic(files.music, 30);
    expect(sine.beats.length === 0 || sine.confidence < 0.5).toBe(true);
  });

  it("gera cópia leve de prévia (vertical 4K HEVC 10 bits → 720p H.264 com faststart)", async () => {
    const src = path.join(dir, "celular.mov");
    await ffmpeg(["-hide_banner", "-nostdin", "-y", "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=60", "-f", "lavfi", "-i", "sine=f=300", "-t", "2", "-c:v", "libx265", "-preset", "ultrafast", "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1", "-c:a", "aac", src]);
    const out = path.join(dir, "previa.mp4");
    await createPreviewProxy(src, out, 2);
    const p = await probeFile(out);
    expect([p.width, p.height]).toEqual([720, 1280]);
    expect(p.fps).toBeLessThanOrEqual(30);
    expect(p.hasAudio).toBe(true);
    expect(p.durationSec).toBeGreaterThan(1.9);
    const head = (await readFile(out)).subarray(0, 65536);
    expect(head.includes(Buffer.from("moov"))).toBe(true);
  }, 120_000);

  it("arquivo corrompido gera erro compreensível (critério 8)", async () => {
    await expect(probeFile(files.corrupt)).rejects.toBeInstanceOf(ProcessingError);
    await expect(probeFile(files.corrupt)).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("cancelamento interrompe o FFmpeg", async () => {
    const ac = new AbortController();
    const p = ffmpeg(["-hide_banner", "-f", "lavfi", "-i", "testsrc2=s=1920x1080:d=600", "-c:v", "libx264", "-f", "null", "-"], { signal: ac.signal });
    setTimeout(() => ac.abort(), 300);
    await expect(p).rejects.toThrow(/cancelado/i);
  });
});
