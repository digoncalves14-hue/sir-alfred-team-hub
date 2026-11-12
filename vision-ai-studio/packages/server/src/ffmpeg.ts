import { spawn, spawnSync } from "node:child_process";
import { getConfig } from "./config";
import { CanceledError, ProcessingError } from "./errors";

export interface RunOptions {
  signal?: AbortSignal;
  /** Duração esperada da saída (segundos) para calcular o progresso. */
  expectedDurationSec?: number;
  onProgress?: (fraction: number) => void;
  /** Coleta stdout como Buffer (ex.: quadros raw). */
  captureStdout?: boolean;
  timeoutMs?: number;
}

export interface RunResult {
  stderr: string;
  stdout: Buffer;
}

const STDERR_LIMIT = 4 * 1024 * 1024;

/**
 * Executa um binário (ffmpeg/ffprobe) com argumentos em array — sem shell,
 * portanto sem possibilidade de injeção de comandos. Suporta cancelamento,
 * tempo limite e progresso real a partir de `-progress pipe:1`.
 */
export function runBinary(bin: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new CanceledError());
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const out: Buffer[] = [];
    let progressBuf = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const onAbort = () => {
      child.kill("SIGKILL");
      finish(() => reject(new CanceledError()));
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          finish(() => reject(new ProcessingError("timeout", "O processamento excedeu o tempo limite.", true)));
        }, opts.timeoutMs)
      : undefined;

    child.stdout.on("data", (d: Buffer) => {
      if (opts.captureStdout) {
        out.push(d);
        return;
      }
      if (!opts.onProgress) return;
      progressBuf += d.toString();
      const lines = progressBuf.split("\n");
      progressBuf = lines.pop() ?? "";
      for (const line of lines) {
        const m = line.match(/^out_time_us=(\d+)/) ?? line.match(/^out_time_ms=(\d+)/);
        if (m && opts.expectedDurationSec) {
          const sec = Number(m[1]) / 1_000_000;
          opts.onProgress(Math.max(0, Math.min(0.999, sec / opts.expectedDurationSec)));
        }
        if (line.trim() === "progress=end") opts.onProgress(1);
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < STDERR_LIMIT) stderr += d.toString();
    });
    child.on("error", (err) => finish(() => reject(err)));
    child.on("close", (code) => {
      finish(() => {
        if (code === 0) resolve({ stderr, stdout: Buffer.concat(out) });
        else reject(new ProcessingError("ffmpeg_failed", friendlyFfmpegError(stderr), false, tail(stderr)));
      });
    });
  });
}

export function ffmpeg(args: string[], opts?: RunOptions) {
  return runBinary(getConfig().FFMPEG_PATH, adaptArgs(args), opts);
}

let majorVersion: number | null | undefined;

/** Versão principal do FFmpeg instalado (null se não for possível ler). */
export function ffmpegMajorVersion(): number | null {
  if (majorVersion !== undefined) return majorVersion;
  try {
    const r = spawnSync(getConfig().FFMPEG_PATH, ["-hide_banner", "-version"], { encoding: "utf8", timeout: 10_000 });
    const m = /ffmpeg version n?(\d+)\./.exec(r.stdout ?? "");
    majorVersion = m ? Number(m[1]) : null;
  } catch {
    majorVersion = null;
  }
  return majorVersion;
}

/**
 * Compatibilidade entre versões: "-filter_complex_script <arquivo>" foi removido no
 * FFmpeg 8; a forma nova "-/filter_complex <arquivo>" existe desde o 7.
 */
export function adaptArgs(args: string[], major = ffmpegMajorVersion()): string[] {
  if (!major || major < 7) return args;
  return args.map((a) => (a === "-filter_complex_script" ? "-/filter_complex" : a));
}

export function ffprobe(args: string[], opts?: RunOptions) {
  return runBinary(getConfig().FFPROBE_PATH, args, opts);
}

function tail(s: string, n = 3000): string {
  return s.length > n ? s.slice(-n) : s;
}

/** Traduz falhas comuns do FFmpeg para mensagens úteis ao usuário. */
export function friendlyFfmpegError(stderr: string): string {
  if (/Invalid data found when processing input|moov atom not found|could not find codec parameters/i.test(stderr)) {
    return "O arquivo parece estar corrompido ou não é um vídeo válido.";
  }
  if (/No such file or directory/i.test(stderr)) return "Um dos arquivos necessários não foi encontrado.";
  if (/Unknown encoder|Encoder .* not found/i.test(stderr)) return "O codificador de vídeo necessário não está disponível no servidor.";
  if (/No space left on device/i.test(stderr)) return "O servidor ficou sem espaço em disco durante o processamento.";
  if (/does not contain any stream|Output file .* does not contain any stream/i.test(stderr)) return "O arquivo não contém trilhas de vídeo/áudio utilizáveis.";
  return "Falha ao processar o vídeo com o FFmpeg.";
}

/**
 * Diagnóstico de falha no grafo de filtros: o FFmpeg nomeia os filtros como
 * "Parsed_<nome>_<índice>" na ordem em que aparecem no script. Devolve as linhas
 * do erro que citam esse filtro e o trecho do grafo correspondente.
 */
export function diagnoseFilterFailure(stderr: string, graph: string): { filter: string; messages: string[]; chain: string | null; filterText: string | null } | null {
  const m = /Parsed_([a-z0-9_]+?)_(\d+)\b/i.exec(stderr);
  if (!m) return null;
  const [name, idx] = [m[1], Number(m[2])];
  const tag = `Parsed_${name}_${idx}`;
  const messages = stderr.split("\n").filter((l) => l.includes(tag) || /Invalid|invalid|too big|not positive|out of range/.test(l)).slice(0, 12);
  // separa o script em filtros respeitando aspas e escapes
  const filters: Array<{ text: string; chain: number }> = [];
  const chains: string[] = [""];
  let cur = "";
  let quoted = false;
  const push = () => {
    const text = cur.replace(/\[[^\]]*\]/g, "").trim();
    if (text) filters.push({ text, chain: chains.length - 1 });
    cur = "";
  };
  for (let i = 0; i < graph.length; i++) {
    const c = graph[i];
    chains[chains.length - 1] += c;
    if (c === "\\" && i + 1 < graph.length) {
      cur += c + graph[++i];
      chains[chains.length - 1] += graph[i];
      continue;
    }
    if (c === "'") quoted = !quoted;
    if (!quoted && (c === "," || c === ";")) {
      push();
      if (c === ";") chains.push("");
      continue;
    }
    cur += c;
  }
  push();
  const f = filters[idx];
  return { filter: tag, messages, chain: f ? chains[f.chain].trim().slice(0, 1500) : null, filterText: f?.text.slice(0, 500) ?? null };
}
