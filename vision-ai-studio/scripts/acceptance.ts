/**
 * Testes de aceite do MVP (seção 20), executados contra a aplicação REAL em
 * execução (web + worker + PostgreSQL + FFmpeg), pela API HTTP.
 *
 * Uso:  npm run acceptance            (BASE_URL padrão: http://localhost:3000)
 *
 * Observação honesta sobre o TESTE 3: se nenhum provedor de transcrição estiver
 * configurado, a etapa de transcrição é substituída por uma transcrição de teste
 * gravada diretamente no banco (identificada como provider "fixture") e o
 * relatório informa isso. A queima de legendas e o SRT são testados de verdade.
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { closeDb, eq, getDb, transcripts } from "@vision/db";
import { makeFixtures } from "./make-fixtures";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let cookie = "";
const results: Array<{ test: string; ok: boolean; detail: string }> = [];

async function http<T = any>(method: string, p: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), cookie, origin: BASE },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  if (res.status >= 300 && res.status < 400) return { redirect: res.headers.get("location") } as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status}: ${(data as any).error ?? ""}`);
  return data as T;
}

async function upload(file: string, role: "source" | "music" | "logo", extra: Record<string, unknown>): Promise<string> {
  const buf = await readFile(file);
  const { assetId, target } = await http("POST", "/api/uploads", { role, fileName: path.basename(file), sizeBytes: buf.length, mime: "", ...extra });
  if (target.mode !== "single") throw new Error("Upload multipart não esperado no teste local.");
  const url = target.url.startsWith("http") ? target.url : `${BASE}${target.url}`;
  const put = await fetch(url, { method: "PUT", body: buf, headers: target.headers });
  if (!put.ok) throw new Error(`PUT upload → ${put.status}`);
  await http("POST", `/api/uploads/${assetId}/complete`, {});
  return assetId;
}

async function waitFor<T>(label: string, fn: () => Promise<T | null | undefined | false>, timeoutMs = 180_000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Tempo esgotado aguardando: ${label}`);
}

function probe(file: string) {
  const r = spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { encoding: "utf8" });
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s: any) => s.codec_type === "video");
  const a = j.streams.find((s: any) => s.codec_type === "audio");
  return { duration: Number(j.format.duration), width: v?.width, height: v?.height, vcodec: v?.codec_name, acodec: a?.codec_name };
}

const detail = (id: string) => http("GET", `/api/projects/${id}`);

/** Exporta e acompanha o progresso real até o download do MP4. */
async function exportAndDownload(projectId: string, preset: string, dir: string, name: string) {
  const { renderIds } = await http("POST", `/api/projects/${projectId}/renders`, { kind: "export", presets: [preset], resolution: "720p", quality: "light" });
  const seen = new Set<number>();
  const render = await waitFor("renderização", async () => {
    const d = await detail(projectId);
    const r = d.renders.find((x: any) => x.id === renderIds[0]);
    const job = d.jobs.find((j: any) => j.id === r?.jobId);
    if (job?.status === "running") seen.add(Math.round(job.progress * 100));
    if (r?.status === "failed") throw new Error(`Renderização falhou: ${r.errorMessage}`);
    return r?.status === "succeeded" ? r : null;
  });
  const dl = await http<{ redirect: string }>("GET", render.downloadUrl);
  const res = await fetch(dl.redirect.startsWith("http") ? dl.redirect : `${BASE}${dl.redirect}`);
  if (!res.ok) throw new Error(`Download → ${res.status}`);
  const out = path.join(dir, `${name}.mp4`);
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  return { file: out, render, progress: [...seen].sort((a, b) => a - b) };
}

async function step(test: string, fn: () => Promise<string>) {
  try {
    const d = await fn();
    results.push({ test, ok: true, detail: d });
    console.log(`✅ ${test}\n   ${d}`);
  } catch (e) {
    results.push({ test, ok: false, detail: (e as Error).message });
    console.log(`❌ ${test}\n   ${(e as Error).message}`);
  }
}

async function main() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "vision-accept-"));
  const fx = await makeFixtures(dir);
  const email = `teste+${Date.now()}@vision.local`;
  await http("POST", "/api/auth/register", { name: "Teste Aceite", email, password: "senha-segura-123", organization: "Sir Alfred QA" });
  const me = await http("GET", "/api/auth/me");
  console.log(`Servidor: ${BASE} · IA: ${me.capabilities.ai ? me.capabilities.aiModel : "não configurada (interpretador local)"} · Transcrição: ${me.capabilities.transcription ? me.capabilities.transcriptionProvider : "não configurada"}\n`);
  const brands = (await http("GET", "/api/brands")).brands;
  const sirAlfred = brands.find((b: any) => b.slug === "sir-alfred-barbearia");
  const { id: projectId } = await http("POST", "/api/projects", { name: "Aceite MVP", kind: "editor", brandId: sirAlfred.id, presets: ["youtube_16x9", "instagram_reels_9x16"] });
  let sourceId = "";

  await step("TESTE 1 — Enviar um MP4 e reproduzi-lo", async () => {
    sourceId = await upload(fx.horizontal, "source", { projectId });
    const d = await waitFor("análise do vídeo", async () => {
      const x = await detail(projectId);
      const a = x.assets.find((y: any) => y.id === sourceId);
      if (a?.status === "error") throw new Error(a.errorMessage);
      return a?.status === "ready" && x.timeline ? x : null;
    });
    const a = d.assets.find((y: any) => y.id === sourceId);
    const res = await fetch(`${BASE}${a.url}`, { headers: { Range: "bytes=0-1023" } });
    if (res.status !== 206 || !res.headers.get("content-type")?.includes("video/mp4")) throw new Error(`Streaming falhou (${res.status})`);
    return `Upload ok, ${a.width}x${a.height}, ${a.durationSec.toFixed(1)}s; streaming com Range → 206 video/mp4; timeline inicial versão ${d.currentVersion.number}.`;
  });

  await step("TESTE 2 — Selecionar um trecho e exportar só esse trecho", async () => {
    await http("POST", `/api/projects/${projectId}/operations`, { operations: [{ op: "keep_range", start: 5, end: 12 }] });
    const r = await exportAndDownload(projectId, "youtube_16x9", dir, "trecho");
    const p = probe(r.file);
    if (Math.abs(p.duration - 7) > 0.2) throw new Error(`Duração ${p.duration}s, esperado ~7s`);
    return `MP4 baixado: ${p.duration.toFixed(2)}s (trecho 5s–12s), ${p.width}x${p.height}, ${p.vcodec}/${p.acodec}.`;
  });

  await step("TESTE 3 — Transcrição em português e legendas sincronizadas incorporadas", async () => {
    let note: string;
    if (me.capabilities.transcription) {
      await http("POST", `/api/projects/${projectId}/transcribe`);
      await waitFor("transcrição", async () => (await detail(projectId)).transcripts.length > 0, 600_000);
      note = `transcrição real (${me.capabilities.transcriptionProvider})`;
    } else {
      // provedor não configurado: grava uma transcrição de TESTE claramente identificada
      await getDb()
        .insert(transcripts)
        .values({
          orgId: (await getDb().query.projects.findFirst({ where: (t, { eq: e }) => e(t.id, projectId) }))!.orgId,
          assetId: sourceId,
          provider: "fixture",
          model: "teste-de-aceite",
          language: "pt",
          text: "Bem-vindo à Sir Alfred. Hoje vamos fazer um degradê.",
          words: [
            { text: "Bem-vindo", start: 5.2, end: 5.8 }, { text: "à", start: 5.85, end: 6 }, { text: "Sir", start: 6.05, end: 6.4 }, { text: "Alfred.", start: 6.45, end: 7.2 },
            { text: "Hoje", start: 8, end: 8.4 }, { text: "vamos", start: 8.45, end: 8.9 }, { text: "fazer", start: 8.95, end: 9.4 }, { text: "um", start: 9.45, end: 9.6 }, { text: "degradê.", start: 9.65, end: 10.6 },
          ],
          segments: [
            { text: "Bem-vindo à Sir Alfred.", start: 5.2, end: 7.2 },
            { text: "Hoje vamos fazer um degradê.", start: 8, end: 10.6 },
          ],
        })
        .onConflictDoNothing();
      note = "SEM provedor de transcrição configurado: usada transcrição de TESTE (provider=fixture); queima de legenda e SRT reais";
    }
    const op = await http("POST", `/api/projects/${projectId}/operations`, { operations: [{ op: "set_captions", enabled: true, style: "highlight_word", position: null }] });
    if (!op.changed) throw new Error(`Legendas não ativadas: ${op.warnings.join(" ")}`);
    const r = await exportAndDownload(projectId, "youtube_16x9", dir, "legendado");
    if (!r.render.srtUrl) throw new Error("SRT não gerado");
    const srtRedirect = await http<{ redirect: string }>("GET", r.render.srtUrl);
    const srt = await (await fetch(srtRedirect.redirect.startsWith("http") ? srtRedirect.redirect : `${BASE}${srtRedirect.redirect}`)).text();
    if (!/00:00:00,\d{3} --> /.test(srt)) throw new Error("SRT inválido");
    return `${note}. MP4 com legendas incorporadas (${probe(r.file).duration.toFixed(1)}s) e SRT com tempos ajustados ao corte: "${srt.split("\n").slice(1, 3).join(" | ")}".`;
  });

  await step("TESTE 4 — Converter horizontal para vertical e exportar", async () => {
    await http("POST", `/api/projects/${projectId}/operations`, { operations: [{ op: "set_format", preset: "instagram_reels_9x16" }] });
    const r = await exportAndDownload(projectId, "instagram_reels_9x16", dir, "vertical");
    const p = probe(r.file);
    if (p.width !== 720 || p.height !== 1280) throw new Error(`Dimensões ${p.width}x${p.height}`);
    const d = await detail(projectId);
    return `MP4 vertical ${p.width}x${p.height}; enquadramento por trecho: ${d.timeline.clips.map((c: any) => `${c.focusSource}${c.focusX != null ? `(x=${c.focusX})` : ""}`).join(", ")}.`;
  });

  await step("TESTE 5 — Comando “crie uma versão de 10 segundos” gera edição real", async () => {
    // volta ao vídeo completo (versão 1) para a IA ter material
    const versions = (await detail(projectId)).versions;
    const v1 = versions.find((v: any) => v.number === 1);
    await http("POST", `/api/projects/${projectId}/versions/${v1.id}/restore`);
    const { commandId } = await http("POST", `/api/projects/${projectId}/commands`, { text: "Crie uma versão de 10 segundos com as melhores cenas" });
    const cmd = await waitFor("comando", async () => {
      const c = (await detail(projectId)).commands.find((x: any) => x.id === commandId);
      if (c?.status === "failed") throw new Error(c.errorMessage);
      return c && (c.status === "applied" || c.status === "no_changes") ? c : null;
    });
    const d = await detail(projectId);
    const dur = d.timeline.clips.reduce((s: number, c: any) => s + c.sourceEnd - c.sourceStart, 0);
    if (Math.abs(dur - 10) > 1) throw new Error(`Duração ${dur}s`);
    const r = await exportAndDownload(projectId, "youtube_16x9", dir, "dez-segundos");
    return `Motor: ${cmd.engine === "anthropic" ? `IA ${cmd.model}` : "interpretador local (sem chave de IA)"}; ${cmd.applied.join(" ")} Trechos: ${d.timeline.clips.map((c: any) => `${c.sourceStart}-${c.sourceEnd}s`).join(", ")}. MP4: ${probe(r.file).duration.toFixed(2)}s.`;
  });

  await step("TESTE 6 — Acompanhar o processamento até a conclusão e baixar o MP4", async () => {
    const r = await exportAndDownload(projectId, "instagram_feed_1x1", dir, "quadrado");
    const p = probe(r.file);
    return `Progresso observado (%): [${r.progress.join(", ") || "renderização mais rápida que o intervalo de consulta"}] → concluído; download ${p.width}x${p.height}, ${p.duration.toFixed(2)}s.`;
  });

  await step("TESTE 7 — Reabrir o projeto e recuperar arquivos, configurações e decisões", async () => {
    const before = await detail(projectId);
    cookie = "";
    await http("POST", "/api/auth/login", { email, password: "senha-segura-123" });
    const after = await detail(projectId);
    const same = JSON.stringify(after.timeline) === JSON.stringify(before.timeline);
    if (!same || after.versions.length !== before.versions.length) throw new Error("Estado divergente após reabrir");
    return `Após novo login: ${after.versions.length} versões, ${after.commands.length} comandos de IA, ${after.renders.length} renderizações, ${after.assets.length} arquivos; timeline idêntica (versão ${after.currentVersion.number}).`;
  });

  await step("TESTE 8 — Forçar erro de processamento sem perder o projeto", async () => {
    const before = await detail(projectId);
    const badId = await upload(fx.corrupt, "source", { projectId });
    const d = await waitFor("falha registrada", async () => {
      const x = await detail(projectId);
      const job = x.jobs.find((j: any) => j.assetId === badId && j.type === "probe");
      return job?.status === "failed" && x.project.status === "error" ? { x, job } : null;
    });
    if (!d.x.timeline || d.x.versions.length !== before.versions.length) throw new Error("Projeto perdeu dados");
    return `Erro informado: “${d.job.errorMessage}” (status do projeto: ${d.x.project.statusLabel}); timeline e ${d.x.versions.length} versões preservadas; botão “Tentar novamente” disponível.`;
  });

  // ===================== FASE 2 =====================
  const restoreV1 = async () => {
    const v1 = (await detail(projectId)).versions.find((v: any) => v.number === 1);
    await http("POST", `/api/projects/${projectId}/versions/${v1.id}/restore`);
  };

  await step("FASE 2 · Template inteligente aplicado de verdade", async () => {
    await restoreV1();
    const r = await http("POST", `/api/projects/${projectId}/template`, { templateId: "sys:transformacao" });
    const d = await detail(projectId);
    const dur = d.timeline.clips.reduce((s: number, c: any) => s + c.sourceEnd - c.sourceStart, 0);
    if (d.timeline.styleId !== "reels_dynamic" || d.timeline.format.preset !== "instagram_reels_9x16" || dur > 31) throw new Error(`Template não aplicado (${d.timeline.styleId}, ${d.timeline.format.preset}, ${dur}s)`);
    return `“Transformação de cabelo”: estilo ${d.timeline.styleId}, ${d.timeline.format.preset}, ${dur.toFixed(1)}s. ${r.applied.join(" ")} ${r.notes.join(" ")}`;
  });

  await step("FASE 2 · Edição pela transcrição (remover e restaurar palavras)", async () => {
    await restoreV1();
    const t = await http("GET", `/api/projects/${projectId}/transcript`);
    const words = t.assets[0].words;
    if (!words.length) throw new Error("Sem palavras com tempo na transcrição");
    const [w0, w3] = [words[0], words[3]];
    await http("POST", `/api/projects/${projectId}/operations`, { operations: [{ op: "remove_source_range", asset_id: sourceId, start: w0.start - 0.05, end: w3.end + 0.05 }] });
    let d = await detail(projectId);
    const inside = d.timeline.clips.some((c: any) => c.sourceStart <= w0.start + 0.01 && c.sourceEnd >= w3.end - 0.01);
    if (inside) throw new Error("Palavras continuam no vídeo");
    const removedDur = d.timeline.clips.reduce((s: number, c: any) => s + c.sourceEnd - c.sourceStart, 0);
    await http("POST", `/api/projects/${projectId}/operations`, { operations: [{ op: "restore_source_range", asset_id: sourceId, start: w0.start - 0.05, end: w3.end + 0.05 }] });
    d = await detail(projectId);
    const back = d.timeline.clips.reduce((s: number, c: any) => s + c.sourceEnd - c.sourceStart, 0);
    if (Math.abs(back - 20) > 0.05) throw new Error(`Restauração incompleta (${back}s)`);
    return `Removidas “${words.slice(0, 4).map((w: any) => w.text).join(" ")}” → ${removedDur.toFixed(2)}s; restauradas → ${back.toFixed(2)}s (vídeo inteiro de volta, em ordem).`;
  });

  await step("FASE 2 · Vídeo longo → sugestões de cortes → corte aprovado vira projeto exportável", async () => {
    const r = await http("POST", `/api/projects/${projectId}/suggestions`, { durationSec: 8, count: 3 });
    if (!r.suggestions.length) throw new Error("Nenhuma sugestão");
    const s0 = r.suggestions[0];
    const { id: childId } = await http("POST", `/api/projects/${projectId}/clips`, { assetId: s0.assetId, start: s0.start, end: s0.end, title: s0.title });
    const out = await exportAndDownload(childId, "instagram_reels_9x16", dir, "corte-aprovado");
    const p = probe(out.file);
    if (Math.abs(p.duration - s0.duration) > 0.3) throw new Error(`Duração ${p.duration} ≠ ${s0.duration}`);
    return `${r.suggestions.length} sugestões (${r.basis}); melhor: “${s0.title}” ${s0.start}–${s0.end}s, pontuação heurística ${s0.score}/100 → novo projeto exportado (${p.width}x${p.height}, ${p.duration.toFixed(2)}s).`;
  });

  await step("FASE 2 · Música com análise de batida e cortes sincronizados", async () => {
    await restoreV1();
    const musicId = await upload(fx.beat, "music", { projectId, licenseNote: "Áudio sintético gerado para teste" });
    const m = await waitFor("análise da música", async () => {
      const a = (await detail(projectId)).assets.find((x: any) => x.id === musicId);
      if (a?.status === "error") throw new Error(a.errorMessage);
      return a?.status === "ready" ? a : null;
    });
    if (!m.bpm || Math.abs(m.bpm - 120) > 3) throw new Error(`BPM ${m.bpm}`);
    await http("POST", `/api/projects/${projectId}/operations`, {
      operations: [
        { op: "remove_range", start: 3.3, end: 6.1 },
        { op: "remove_range", start: 9.7, end: 11.2 },
        { op: "set_music", action: "add", asset_id: musicId, volume: 0.4, ducking: true },
        { op: "sync_to_beat", max_shift_sec: 0.35 },
      ],
    });
    const d = await detail(projectId);
    let t = 0;
    const cuts: number[] = [];
    for (const c of d.timeline.clips.slice(0, -1)) {
      t += c.sourceEnd - c.sourceStart;
      cuts.push(Math.round(t * 1000) / 1000);
    }
    const off = cuts.map((c) => Math.abs(((c + 0.25) % 0.5) - 0.25));
    if (!cuts.length || Math.max(...off) > 0.06) throw new Error(`Cortes fora da batida: ${cuts.join(", ")}`);
    const out = await exportAndDownload(projectId, "youtube_16x9", dir, "com-musica");
    return `Música: ${m.bpm} BPM detectado; cortes em ${cuts.map((c) => `${c}s`).join(", ")} (grade de 0,5s); MP4 com música e ducking: ${probe(out.file).duration.toFixed(2)}s, áudio ${probe(out.file).acodec}.`;
  });

  await step("FASE 2 · Gerador de textos para redes sociais", async () => {
    if (!me.capabilities.ai) {
      try {
        await http("POST", `/api/projects/${projectId}/content`);
        throw new Error("Deveria recusar sem chave de IA");
      } catch (e) {
        if (!/501/.test((e as Error).message)) throw e;
      }
      return "Sem ANTHROPIC_API_KEY: o recurso recusa com mensagem clara (HTTP 501) e não inventa textos — comportamento esperado neste ambiente.";
    }
    const { id } = await http("POST", `/api/projects/${projectId}/content`);
    const c = await waitFor("textos", async () => {
      const x = (await detail(projectId)).content;
      if (x?.id === id && x.status === "failed") throw new Error(x.errorMessage);
      return x?.id === id && x.status === "succeeded" ? x : null;
    });
    return `Títulos: ${c.data.youtube_titles.join(" | ")} · ${c.data.hashtags.length} hashtags.`;
  });

  console.log(`\nResultado: ${results.filter((r) => r.ok).length}/${results.length} testes de aceite aprovados (Fase 1 + Fase 2).`);
  await writeFile(path.resolve("acceptance-report.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), capabilities: me.capabilities, results }, null, 2));
  await closeDb();
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exitCode = 1;
});
