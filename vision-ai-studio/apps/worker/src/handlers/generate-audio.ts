import { writeFile } from "node:fs/promises";
import path from "node:path";
import { type EditOperation, type Timeline, timelineDuration } from "@vision/core";
import { assets, transcripts } from "@vision/db";
import { ProcessingError, capabilities, getStorage, makeStorageKey } from "@vision/server";
import { AI_MUSIC_LICENSE_NOTE, AI_VOICE_LICENSE_NOTE, analyzeMusic, generateMusic, narrate, probeFile } from "@vision/server/node";
import type { JobContext } from "../context";

/**
 * Executa as operações que dependem de geração por IA (trilha e narração) antes do
 * motor de edição: gera o áudio na ElevenLabs, salva como arquivo do projeto e troca
 * a operação por uma operação comum (set_music / set_voiceover). Falhas não derrubam
 * o comando: viram "não executado" com o motivo.
 */
export async function resolveGenerativeOps(
  ctx: JobContext,
  project: { id: string; orgId: string },
  timeline: Timeline,
  operations: EditOperation[],
): Promise<{ operations: EditOperation[]; generated: string[] }> {
  if (!operations.some((o) => o.op === "generate_music" || o.op === "add_narration")) return { operations, generated: [] };
  if (!capabilities().aiMusic) return { operations, generated: [] };
  const out: EditOperation[] = [];
  const generated: string[] = [];
  for (const op of operations) {
    if (op.op === "generate_music") {
      ctx.progress(0.5, "Compondo trilha sonora com IA");
      try {
        const length = Math.ceil(timelineDuration(timeline)) + 1;
        const audio = await generateMusic(op.prompt, length, op.instrumental);
        const id = await saveAudio(ctx, project, audio, "music", "Trilha gerada por IA.mp3", AI_MUSIC_LICENSE_NOTE, true);
        out.push({ op: "set_music", action: "add", asset_id: id, volume: null, ducking: true });
        generated.push(id);
      } catch (err) {
        out.push({ op: "unsupported", request: "gerar trilha sonora com IA", reason: (err as Error).message });
      }
      continue;
    }
    if (op.op === "add_narration") {
      ctx.progress(0.55, "Gravando narração com voz de IA");
      try {
        const n = await narrate(op.text, op.voice ?? "feminina");
        const id = await saveAudio(ctx, project, n.audio, "voiceover", "Narração IA.mp3", AI_VOICE_LICENSE_NOTE, false);
        if (n.words.length) {
          await ctx.db.insert(transcripts).values({
            orgId: project.orgId,
            assetId: id,
            provider: "elevenlabs",
            model: n.voiceName,
            language: "pt",
            text: op.text,
            words: n.words,
            segments: [{ text: op.text, start: n.words[0].start, end: n.words[n.words.length - 1].end }],
          });
        }
        out.push({ op: "set_voiceover", asset_id: id, start_sec: op.start_sec, volume: null });
        generated.push(id);
      } catch (err) {
        out.push({ op: "unsupported", request: "narração com voz de IA", reason: (err as Error).message });
      }
      continue;
    }
    out.push(op);
  }
  return { operations: out, generated };
}

async function saveAudio(
  ctx: JobContext,
  project: { id: string; orgId: string },
  audio: Buffer,
  role: "music" | "voiceover",
  name: string,
  licenseNote: string,
  analyzeBeats: boolean,
): Promise<string> {
  const file = path.join(ctx.tmpDir, `${role}-${Date.now()}.mp3`);
  await writeFile(file, audio);
  const probe = await probeFile(file, ctx.signal);
  if (!probe.hasAudio || probe.durationSec <= 0.3) throw new ProcessingError("ai_audio_invalid", "O áudio gerado pela IA veio vazio ou inválido.", true);
  let analysis: Record<string, unknown> | null = null;
  if (analyzeBeats) {
    try {
      analysis = (await analyzeMusic(file, probe.durationSec, ctx.signal)) as unknown as Record<string, unknown>;
    } catch (err) {
      ctx.log.warn("music_analysis_failed", { err });
    }
  }
  const key = makeStorageKey(project.orgId, role === "music" ? "music" : "voiceover", "mp3");
  const size = await getStorage().uploadFile(file, key, "audio/mpeg");
  const [row] = await ctx.db
    .insert(assets)
    .values({
      orgId: project.orgId,
      projectId: project.id,
      kind: "audio",
      role,
      originalName: name,
      mime: "audio/mpeg",
      sizeBytes: size,
      storageKey: key,
      status: "ready",
      probe: probe as unknown as Record<string, unknown>,
      analysis,
      durationSec: probe.durationSec,
      hasAudio: true,
      licenseNote,
    })
    .returning();
  return row.id;
}
