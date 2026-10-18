/**
 * Gera arquivos de teste com FFmpeg (sem dependências externas):
 *  - horizontal.mp4: 1280x720, 20s, objeto em movimento, tom com pausas (silêncios 4-7s e 13-15s)
 *  - logo.png, musica.mp3, corrompido.mp4
 * Uso: npm run fixtures [-- pasta]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";

export async function makeFixtures(dir: string): Promise<Record<string, string>> {
  await mkdir(dir, { recursive: true });
  const run = (args: string[]) => {
    const r = spawnSync(process.env.FFMPEG_PATH ?? "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
  };
  const files = {
    horizontal: path.join(dir, "horizontal.mp4"),
    logo: path.join(dir, "logo.png"),
    music: path.join(dir, "musica.mp3"),
    corrupt: path.join(dir, "corrompido.mp4"),
    noAudio: path.join(dir, "sem-audio.mp4"),
    beat: path.join(dir, "batida-120bpm.mp3"),
  };
  // caixa branca se movendo para a direita na segunda metade; tom com pausas
  run([
    "-f", "lavfi", "-i", "color=c=0x202024:s=1280x720:r=30:d=20",
    "-f", "lavfi", "-i", "color=c=white:s=160x160:r=30:d=20",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=20",
    "-filter_complex",
    "[0:v][1:v]overlay=x='if(lt(t,10),200,200+(t-10)*80)':y=280[v];[2:a]volume=enable='between(t,4,7)+between(t,13,15)':volume=0[a]",
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", files.horizontal,
  ]);
  run(["-f", "lavfi", "-i", "color=c=0xD4AF37:s=400x200:d=1", "-frames:v", "1", files.logo]);
  run(["-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=30", "-c:a", "libmp3lame", "-b:a", "128k", files.music]);
  run(["-f", "lavfi", "-i", "testsrc2=s=640x360:r=25:d=6", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", files.noAudio]);
  // cliques a 120 BPM (uma batida a cada 0,5 s) sobre um tom grave
  run([
    "-f", "lavfi", "-i", "aevalsrc='0.8*sin(2*PI*900*t)*exp(-40*mod(t,0.5))+0.1*sin(2*PI*110*t)':s=44100:d=20",
    "-c:a", "libmp3lame", "-b:a", "128k", files.beat,
  ]);
  await writeFile(files.corrupt, Buffer.concat([Buffer.from("not a video"), randomBytes(50_000)]));
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = path.resolve(process.argv[2] ?? "data/fixtures");
  makeFixtures(dir).then((f) => console.log("Arquivos de teste gerados:", f));
}
