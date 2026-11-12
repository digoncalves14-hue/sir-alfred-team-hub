"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Music2, Pause, Play, Upload, Volume2, VolumeX, Wand2 } from "lucide-react";
import { timelineDuration, type EditOperation, type Timeline } from "@vision/core";
import { uploadFile } from "@/lib/upload-client";
import { apiFetch } from "@/lib/client";
import { Alert, Button, Progress, cx } from "../ui";
import type { Detail, StudioActions } from "./types";

/** Áudio (volume, normalização, ruído, silêncios), música licenciada e logo da marca. */
export function AudioPanel({ data, timeline, actions }: { data: Detail; timeline: Timeline; actions: StudioActions }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [license, setLicense] = useState("");
  const [upload, setUpload] = useState<number | null>(null);
  const [silence, setSilence] = useState(0.7);
  const music = data.assets.filter((a) => a.role === "music");
  const cur = timeline.audio.music;
  const logoReady = Boolean(data.brand?.logoAssetId);
  const [mood, setMood] = useState("");
  const [script, setScript] = useState("");
  const [voice, setVoice] = useState<"feminina" | "masculina">("feminina");
  const [voiceId, setVoiceId] = useState<string>("");
  const [muteOriginal, setMuteOriginal] = useState(true);
  const [narrationCaptions, setNarrationCaptions] = useState(true);
  const [genBusy, setGenBusy] = useState(false);
  const aiAudio = data.capabilities.aiMusic;
  const voices = useVoices(aiAudio);
  const muted = timeline.audio.originalVolume <= 0.01;
  // a geração passa pelo assistente (fica no histórico e vira nova versão)
  const command = async (text: string, done: string, operations?: EditOperation[]) => {
    setGenBusy(true);
    try {
      await apiFetch(`/api/projects/${data.project.id}/commands`, { method: "POST", json: operations ? { text, operations } : { text } });
      actions.notify(done, "success");
      await actions.refresh();
    } catch (e) {
      actions.notify((e as Error).message, "error");
    } finally {
      setGenBusy(false);
    }
  };

  const sendMusic = async (f: File | undefined) => {
    if (!f) return;
    if (!license.trim()) return actions.notify("Informe a licença ou autorização de uso da música antes de enviar.", "warn");
    try {
      setUpload(0);
      await uploadFile(f, { role: "music", projectId: data.project.id, licenseNote: license.trim(), onProgress: setUpload });
      setLicense("");
      actions.notify("Música enviada. Ela fica disponível assim que o processamento terminar.", "success");
      await actions.refresh();
    } catch (e) {
      actions.notify((e as Error).message, "error");
    } finally {
      setUpload(null);
    }
  };

  return (
    <div className="space-y-6 p-4">
      <section className="space-y-3">
        <p className="label">Trilha e narração com IA</p>
        {!aiAudio ? (
          <p className="text-xs text-neutral-500">Indisponível: configure a chave da ElevenLabs (ELEVENLABS_API_KEY) no servidor.</p>
        ) : (
          <>
            <div className="flex gap-2">
              <input className="input flex-1 text-sm" placeholder="Clima da trilha (ex.: elegante, animada, calma)" value={mood} onChange={(e) => setMood(e.target.value)} />
              <Button size="sm" disabled={genBusy} onClick={() => void command(`Gere uma trilha sonora com IA, instrumental, no clima: ${mood.trim() || "moderno e confiante, combinando com a marca"}`, "Compondo a trilha… acompanhe no Assistente.")}>
                <Wand2 className="h-4 w-4" /> Gerar trilha
              </Button>
            </div>
            <div className="space-y-2 rounded-lg border border-ink-700 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium"><Mic className="h-4 w-4 text-gold-500" /> Narração com voz de IA</p>
              <textarea
                className="input min-h-24 w-full text-sm"
                placeholder="Escreva o que a voz vai falar no vídeo. Deixe vazio para a IA escrever o roteiro."
                value={script}
                onChange={(e) => setScript(e.target.value)}
                maxLength={2500}
              />
              {script.trim() && (
                <p className="text-[11px] text-neutral-500">
                  ≈ {Math.round(script.trim().split(/\s+/).length / 2.5)}s de fala · vídeo com {Math.round(timelineDuration(timeline))}s
                </p>
              )}
              <VoicePicker voices={voices} voiceId={voiceId} setVoiceId={setVoiceId} gender={voice} setGender={setVoice} />
              <Toggle checked={muteOriginal} label="Deixar o vídeo mudo (tirar o som original dos vídeos)" onChange={setMuteOriginal} />
              <Toggle checked={narrationCaptions} label="Colocar legenda acompanhando a narração" onChange={setNarrationCaptions} />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={genBusy}
                  onClick={() => {
                    const text = script.trim();
                    const name = voices.list?.find((v) => v.id === voiceId)?.name;
                    if (!text) {
                      return void command(
                        `Escreva um roteiro curto de narração para este vídeo e adicione com voz ${voice}${narrationCaptions ? ", com legendas" : ""}${muteOriginal ? ", e deixe o áudio original dos vídeos mudo" : ""}`,
                        "Escrevendo e gravando a narração… acompanhe no Assistente.",
                      );
                    }
                    const ops: EditOperation[] = [];
                    if (muteOriginal) ops.push({ op: "set_audio", original_volume: 0, normalize: null, denoise: null });
                    ops.push({ op: "add_narration", text, voice, voice_id: voiceId || null, start_sec: null });
                    if (narrationCaptions) ops.push({ op: "set_captions", enabled: true, style: null, position: null });
                    void command(`Narração${name ? ` com a voz ${name}` : ` com voz ${voice}`}: "${text.slice(0, 200)}${text.length > 200 ? "…" : ""}"`, "Gravando a narração… acompanhe no Assistente.", ops);
                  }}
                >
                  <Wand2 className="h-4 w-4" /> Gravar narração
                </Button>
                {timeline.audio.voiceover && (
                  <button className="text-xs text-neutral-500 hover:text-red-400" onClick={() => void actions.runOps([{ op: "remove_narration" }], "Narração removida")}>
                    remover narração
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-neutral-500">Áudio gerado pela ElevenLabs; o uso comercial segue os termos do plano da sua conta ElevenLabs.</p>
          </>
        )}
      </section>
      <section className="space-y-3">
        <p className="label">Áudio original</p>
        <Button
          size="sm"
          variant={muted ? "primary" : "ghost"}
          onClick={() => actions.runOps([{ op: "set_audio", original_volume: muted ? 1 : 0, normalize: null, denoise: null }], muted ? "Som original ligado" : "Vídeo mudo: som original desligado")}
        >
          {muted ? <><Volume2 className="h-3.5 w-3.5" /> Ligar o som original</> : <><VolumeX className="h-3.5 w-3.5" /> Deixar o vídeo mudo</>}
        </Button>
        <label className="block text-xs text-neutral-400">
          Volume {Math.round(timeline.audio.originalVolume * 100)}%
          <input type="range" min={0} max={2} step={0.05} defaultValue={timeline.audio.originalVolume} key={timeline.audio.originalVolume} className="mt-1 w-full" onMouseUp={(e) => actions.runOps([{ op: "set_audio", original_volume: Number(e.currentTarget.value), normalize: null, denoise: null }], "Volume original ajustado")} onTouchEnd={(e) => actions.runOps([{ op: "set_audio", original_volume: Number(e.currentTarget.value), normalize: null, denoise: null }], "Volume original ajustado")} />
        </label>
        <Toggle checked={timeline.audio.normalize} label="Normalizar volume (−14 LUFS, padrão de redes sociais)" onChange={(v) => actions.runOps([{ op: "set_audio", original_volume: null, normalize: v, denoise: null }])} />
        <Toggle checked={timeline.audio.denoise} label="Reduzir ruído de fundo" onChange={(v) => actions.runOps([{ op: "set_audio", original_volume: null, normalize: null, denoise: v }])} />
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-neutral-400">
            Silêncios maiores que
            <select className="input mt-1 w-28 py-1" value={silence} onChange={(e) => setSilence(Number(e.target.value))}>
              {[0.4, 0.5, 0.7, 1, 1.5, 2].map((s) => <option key={s} value={s}>{s.toLocaleString("pt-BR")} s</option>)}
            </select>
          </label>
          <Button size="sm" onClick={() => actions.runOps([{ op: "remove_silences", min_silence_sec: silence, padding_sec: 0.15 }])}><VolumeX className="h-3.5 w-3.5" /> Remover silêncios</Button>
          <Button size="sm" onClick={() => actions.runOps([{ op: "remove_static", min_duration_sec: 2 }])}><Wand2 className="h-3.5 w-3.5" /> Remover trechos parados</Button>
        </div>
      </section>

      <section className="space-y-3">
        <p className="label">Música</p>
        <Alert>Não há biblioteca de músicas integrada nesta versão. Use apenas faixas que você tem direito de usar e registre a licença no envio.</Alert>
        {music.length > 0 && (
          <ul className="space-y-1.5">
            {music.map((m) => (
              <li key={m.id} className={cx("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", cur?.assetId === m.id ? "border-gold-600 bg-gold-700/10" : "border-ink-700 bg-ink-850")}>
                <Music2 className="h-4 w-4 text-gold-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{m.name}</span>
                  <span className="block truncate text-[10px] text-neutral-500">{m.brandId ? "Da marca · " : ""}{m.bpm ? `${Math.round(m.bpm)} BPM · ` : m.status === "ready" ? "batida não detectada · " : ""}Licença: {m.licenseNote ?? "—"}</span>
                </span>
                {m.status !== "ready" ? (
                  <span className="text-[11px] text-neutral-500">{m.status === "error" ? "Erro" : "Processando…"}</span>
                ) : cur?.assetId === m.id ? (
                  <Button size="sm" variant="ghost" onClick={() => actions.runOps([{ op: "set_music", action: "remove", asset_id: null, volume: null, ducking: null }])}>Remover</Button>
                ) : (
                  <Button size="sm" onClick={() => actions.runOps([{ op: "set_music", action: "add", asset_id: m.id, volume: null, ducking: true }])}>Usar</Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {cur && (
          <div className="space-y-2 rounded-lg border border-ink-700 p-3">
            <label className="block text-xs text-neutral-400">
              Volume da música {Math.round(cur.volume * 100)}%
              <input type="range" min={0} max={1} step={0.02} defaultValue={cur.volume} key={cur.volume} className="mt-1 w-full" onMouseUp={(e) => actions.runOps([{ op: "set_music", action: "adjust", asset_id: null, volume: Number(e.currentTarget.value), ducking: null }], "Volume da música ajustado")} onTouchEnd={(e) => actions.runOps([{ op: "set_music", action: "adjust", asset_id: null, volume: Number(e.currentTarget.value), ducking: null }], "Volume da música ajustado")} />
            </label>
            <Toggle checked={cur.ducking} label="Abaixar a música automaticamente durante a fala" onChange={(v) => actions.runOps([{ op: "set_music", action: "adjust", asset_id: null, volume: null, ducking: v }])} />
            <Button size="sm" disabled={!music.find((m) => m.id === cur.assetId)?.bpm} onClick={() => actions.runOps([{ op: "sync_to_beat", max_shift_sec: 0.35 }])}>Sincronizar cortes com a batida</Button>
            <p className="text-[11px] text-neutral-500">Fade in de {cur.fadeInSec}s e fade out de {cur.fadeOutSec}s. A redução durante a fala é aplicada no arquivo renderizado (a prévia não simula).</p>
          </div>
        )}
        <div className="space-y-2 rounded-lg border border-dashed border-ink-700 p-3">
          <input className="input" placeholder="Licença / autorização (obrigatório)" value={license} onChange={(e) => setLicense(e.target.value)} maxLength={500} />
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={upload !== null}><Upload className="h-3.5 w-3.5" /> Enviar música própria</Button>
          <input ref={fileRef} type="file" accept="audio/*" hidden onChange={(e) => void sendMusic(e.target.files?.[0])} />
          {upload !== null && <Progress value={upload} />}
        </div>
      </section>

      <section className="space-y-3">
        <p className="label">Logo da marca</p>
        {!data.brand ? (
          <Alert tone="warn">Selecione uma marca para o projeto (no topo do estúdio).</Alert>
        ) : !logoReady ? (
          <Alert tone="warn">A marca {data.brand.name} ainda não tem logo oficial. Envie em <a className="underline" href={`/marcas/${data.brand.id}`}>Minhas Marcas</a>.</Alert>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {data.brand.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.brand.logoUrl} alt="Logo oficial" className="h-10 max-w-[120px] rounded bg-ink-800 object-contain p-1" />
            )}
            <Button size="sm" onClick={() => actions.runOps([{ op: "add_logo", placement: "end_card", duration_sec: 3 }])}>Cartela final</Button>
            <Button size="sm" onClick={() => actions.runOps([{ op: "add_logo", placement: "watermark", duration_sec: null }])}>No canto</Button>
            {timeline.logos.length > 0 && <Button size="sm" variant="ghost" onClick={() => actions.runOps([{ op: "remove_logo", placement: "all" }])}>Remover</Button>}
          </div>
        )}
      </section>
    </div>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
      <input type="checkbox" className="accent-[#D4AF37]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

interface VoiceOption {
  id: string;
  name: string;
  gender: "feminina" | "masculina" | null;
  description: string;
  portuguese: boolean;
  previewUrl: string | null;
}

function useVoices(enabled: boolean) {
  const [list, setList] = useState<VoiceOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    apiFetch<{ voices: VoiceOption[] }>("/api/voices")
      .then((r) => alive && setList(r.voices))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return { list, error };
}

/** Escolha da voz da ElevenLabs, com amostra para ouvir antes de gravar. */
function VoicePicker({
  voices,
  voiceId,
  setVoiceId,
  gender,
  setGender,
}: {
  voices: { list: VoiceOption[] | null; error: string | null };
  voiceId: string;
  setVoiceId: (id: string) => void;
  gender: "feminina" | "masculina";
  setGender: (g: "feminina" | "masculina") => void;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => audio.current?.pause(), []);
  const selected = voices.list?.find((v) => v.id === voiceId) ?? null;
  const preview = () => {
    if (!selected?.previewUrl) return;
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
      return;
    }
    audio.current?.pause();
    const a = new Audio(selected.previewUrl);
    a.onended = () => setPlaying(false);
    audio.current = a;
    void a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };
  const pt = voices.list?.filter((v) => v.portuguese) ?? [];
  const other = voices.list?.filter((v) => !v.portuguese) ?? [];
  const label = (v: VoiceOption) => `${v.name}${v.gender ? ` (${v.gender})` : ""}${v.description ? ` · ${v.description}` : ""}`;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <select
          className="input min-w-0 flex-1 py-1 text-xs"
          aria-label="Voz da narração"
          value={voiceId || `auto:${gender}`}
          onChange={(e) => {
            audio.current?.pause();
            setPlaying(false);
            const v = e.target.value;
            if (v.startsWith("auto:")) {
              setVoiceId("");
              setGender(v.slice(5) as "feminina" | "masculina");
            } else {
              setVoiceId(v);
              const g = voices.list?.find((x) => x.id === v)?.gender;
              if (g) setGender(g);
            }
          }}
        >
          <option value="auto:feminina">Automática · voz feminina</option>
          <option value="auto:masculina">Automática · voz masculina</option>
          {pt.length > 0 && (
            <optgroup label="Falam português">
              {pt.map((v) => <option key={v.id} value={v.id}>{label(v)}</option>)}
            </optgroup>
          )}
          {other.length > 0 && (
            <optgroup label="Outras vozes (multilíngues)">
              {other.map((v) => <option key={v.id} value={v.id}>{label(v)}</option>)}
            </optgroup>
          )}
        </select>
        <Button size="sm" variant="ghost" disabled={!selected?.previewUrl} onClick={preview} aria-label="Ouvir amostra da voz">
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} Ouvir
        </Button>
      </div>
      {voices.list === null && !voices.error && <p className="text-[11px] text-neutral-500">Carregando vozes da ElevenLabs…</p>}
      {voices.error && <p className="text-[11px] text-amber-400">{voices.error} Dá para gravar com a voz automática.</p>}
    </div>
  );
}
