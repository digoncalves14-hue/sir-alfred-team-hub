import { mkdtemp, readFile, rm } from "node:fs/promises";
import { openAsBlob } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TranscriptData } from "@vision/core";
import { getConfig } from "./config";
import { ProcessingError } from "./errors";
import { runBinary } from "./ffmpeg";
import { extractAudioChunks } from "./media";

export interface TranscriptionResult extends TranscriptData {
  provider: string;
  model: string;
}

export interface TranscriptionProvider {
  readonly name: string;
  transcribe(mediaPath: string, opts: { durationSec: number; language: string; signal?: AbortSignal; onProgress?: (f: number) => void }): Promise<TranscriptionResult>;
}

/**
 * Transcrição via API de áudio da OpenAI (whisper-1 / gpt-4o-transcribe),
 * com timestamps por palavra. O áudio é dividido em blocos de 10 minutos para
 * respeitar o limite de 25 MB por requisição.
 */
export class OpenAITranscription implements TranscriptionProvider {
  readonly name = "openai";
  async transcribe(mediaPath: string, opts: { durationSec: number; language: string; signal?: AbortSignal; onProgress?: (f: number) => void }) {
    const c = getConfig();
    if (!c.OPENAI_API_KEY) throw new ProcessingError("transcription_not_configured", "Transcrição não configurada (OPENAI_API_KEY ausente).");
    const dir = await mkdtemp(path.join(os.tmpdir(), "vision-tr-"));
    try {
      const chunks = await extractAudioChunks(mediaPath, dir, opts.durationSec, 600, "mp3", opts.signal);
      const words: TranscriptData["words"] = [];
      const segments: TranscriptData["segments"] = [];
      const texts: string[] = [];
      for (const [i, ch] of chunks.entries()) {
        const form = new FormData();
        form.append("file", await openAsBlob(ch.path, { type: "audio/mpeg" }), path.basename(ch.path));
        form.append("model", c.OPENAI_TRANSCRIBE_MODEL);
        form.append("language", opts.language);
        form.append("response_format", "verbose_json");
        form.append("timestamp_granularities[]", "word");
        form.append("timestamp_granularities[]", "segment");
        const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${c.OPENAI_API_KEY}` },
          body: form,
          signal: opts.signal,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          const retryable = res.status === 429 || res.status >= 500;
          throw new ProcessingError("transcription_failed", `O serviço de transcrição respondeu com erro (${res.status}).`, retryable, body.slice(0, 500));
        }
        const data = (await res.json()) as {
          text?: string;
          words?: Array<{ word: string; start: number; end: number }>;
          segments?: Array<{ text: string; start: number; end: number }>;
        };
        texts.push((data.text ?? "").trim());
        for (const w of data.words ?? []) words.push({ text: w.word.trim(), start: w.start + ch.offset, end: w.end + ch.offset });
        for (const s of data.segments ?? []) segments.push({ text: s.text.trim(), start: s.start + ch.offset, end: s.end + ch.offset });
        opts.onProgress?.((i + 1) / chunks.length);
      }
      attachPunctuation(words, segments);
      return { provider: this.name, model: c.OPENAI_TRANSCRIBE_MODEL, language: opts.language, text: texts.join(" ").trim(), words, segments };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

/**
 * Transcrição local com whisper.cpp (sem custo por uso; requer o binário e um
 * modelo baixado). Os tempos por palavra são aproximados a partir dos segmentos.
 */
export class WhisperCppTranscription implements TranscriptionProvider {
  readonly name = "whisper_cpp";
  async transcribe(mediaPath: string, opts: { durationSec: number; language: string; signal?: AbortSignal; onProgress?: (f: number) => void }) {
    const c = getConfig();
    if (!c.WHISPER_CPP_BIN || !c.WHISPER_CPP_MODEL) throw new ProcessingError("transcription_not_configured", "whisper.cpp não configurado.");
    const dir = await mkdtemp(path.join(os.tmpdir(), "vision-wc-"));
    try {
      const [wav] = await extractAudioChunks(mediaPath, dir, opts.durationSec, Math.ceil(opts.durationSec) + 1, "wav", opts.signal);
      const outBase = path.join(dir, "out");
      await runBinary(c.WHISPER_CPP_BIN, ["-m", c.WHISPER_CPP_MODEL, "-l", opts.language, "-oj", "-of", outBase, "-f", wav.path], { signal: opts.signal });
      const json = JSON.parse(await readFile(`${outBase}.json`, "utf8")) as {
        transcription?: Array<{ text: string; offsets: { from: number; to: number } }>;
      };
      const segments = (json.transcription ?? [])
        .map((s) => ({ text: s.text.trim(), start: s.offsets.from / 1000, end: s.offsets.to / 1000 }))
        .filter((s) => s.text);
      opts.onProgress?.(1);
      return { provider: this.name, model: path.basename(c.WHISPER_CPP_MODEL), language: opts.language, text: segments.map((s) => s.text).join(" "), words: [], segments };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

/** As palavras do Whisper vêm sem pontuação; recupera a pontuação a partir dos segmentos. */
export function attachPunctuation(words: TranscriptData["words"], segments: TranscriptData["segments"]): void {
  for (const seg of segments) {
    const tokens = seg.text.split(/\s+/).filter(Boolean);
    const inSeg = words.filter((w) => w.start >= seg.start - 0.05 && w.end <= seg.end + 0.05);
    if (inSeg.length !== tokens.length) continue;
    inSeg.forEach((w, i) => {
      const bare = tokens[i].replace(/[^\p{L}\p{N}'-]/gu, "").toLowerCase();
      if (bare === w.text.replace(/[^\p{L}\p{N}'-]/gu, "").toLowerCase()) w.text = tokens[i];
    });
  }
}

export function getTranscriptionProvider(): TranscriptionProvider | null {
  const c = getConfig();
  if (c.transcriptionProvider === "openai" && c.OPENAI_API_KEY) return new OpenAITranscription();
  if (c.transcriptionProvider === "whisper_cpp" && c.WHISPER_CPP_BIN && c.WHISPER_CPP_MODEL) return new WhisperCppTranscription();
  return null;
}
