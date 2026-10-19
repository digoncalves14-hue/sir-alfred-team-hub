"use client";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Film, Sparkles, Upload, Wand2, X } from "lucide-react";
import { DESTINATIONS, EDIT_STYLES, FORMAT_PRESETS, type FormatPresetId, type TemplateDef } from "@vision/core";
import type { BrandDto } from "@/lib/dto";
import { apiFetch } from "@/lib/client";
import { uploadFile } from "@/lib/upload-client";
import { fmtBytes } from "@/lib/format";
import { Alert, Badge, Button, Progress, cx } from "./ui";

const EXAMPLES = [
  "Crie um Reels de 40 segundos com as melhores cenas, legendas automáticas e finalize com a logo da marca.",
  "Faça uma versão de 30 segundos, remova os silêncios e adicione legendas com palavra destacada.",
  "Deixe o vídeo mais dinâmico e remova os momentos em que não acontece nada.",
  "Formato vertical, mantenha só o começo até 15 segundos e coloque a logo no canto.",
];

const PLATFORM_LABEL = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook" } as const;

export function NewProjectWizard({ brands, templates, editorMode, capabilities }: { brands: BrandDto[]; templates: TemplateDef[]; editorMode: boolean; capabilities: { ai: boolean; transcription: boolean; maxUploadMb: number } }) {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [brandId, setBrandId] = useState<string | null>(brands[0]?.id ?? null);
  const [presets, setPresets] = useState<FormatPresetId[]>(["instagram_reels_9x16"]);
  const [styleId, setStyleId] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [name, setName] = useState("");
  const [autoRender, setAutoRender] = useState(true);
  const [resolution, setResolution] = useState<"720p" | "1080p" | "2160p">("1080p");
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<"idle" | "creating" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);
  const brand = brands.find((b) => b.id === brandId) ?? null;
  const totalSize = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files]);
  const totalProgress = files.length ? files.reduce((s, f) => s + (progress[f.name] ?? 0) * f.size, 0) / Math.max(1, totalSize) : 0;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const ok = [...list].filter((f) => /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(f.name));
    if (ok.length < list.length) setError("Alguns arquivos foram ignorados: envie vídeos MP4, MOV, M4V, WEBM, MKV ou AVI.");
    const tooBig = ok.find((f) => f.size > capabilities.maxUploadMb * 1024 * 1024);
    if (tooBig) {
      setError(`"${tooBig.name}" excede o limite de ${capabilities.maxUploadMb} MB.`);
      return;
    }
    setFiles((prev) => [...prev, ...ok.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))]);
    if (!name && ok[0]) setName(ok[0].name.replace(/\.[^.]+$/, "").slice(0, 80));
  };

  const togglePreset = (p: FormatPresetId) => setPresets((cur) => (cur.includes(p) ? (cur.length > 1 ? cur.filter((x) => x !== p) : cur) : [...cur, p]));

  const submit = async () => {
    setError(null);
    if (!files.length) return setError("Adicione pelo menos um vídeo.");
    if (!editorMode && command.trim().length < 3 && !templateId) return setError("Descreva o que a IA deve fazer ou escolha um template.");
    try {
      setPhase("creating");
      const { id } = await apiFetch<{ id: string }>("/api/projects", {
        method: "POST",
        json: {
          name: name.trim() || "Novo projeto",
          kind: editorMode ? "editor" : "ai_video",
          brandId,
          presets,
          styleId,
          templateId: editorMode ? null : templateId,
          autopilot: editorMode ? null : { command: command.trim() || "Aplique o template escolhido.", autoRender, resolution },
        },
      });
      setPhase("uploading");
      for (const f of files) {
        await uploadFile(f, { role: "source", projectId: id, onProgress: (p) => setProgress((cur) => ({ ...cur, [f.name]: p })) });
      }
      router.push(`/projetos/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setPhase("idle");
    }
  };

  const busy = phase !== "idle";
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-gold-500">{editorMode ? "Editor completo" : "Criar vídeo com IA"}</p>
        <h1 className="mt-1 text-2xl font-semibold">{editorMode ? "Novo projeto no editor" : "Novo projeto com IA"}</h1>
      </div>

      <Step n={1} title="Envie seus vídeos">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
          onClick={() => !busy && input.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-ink-600 bg-ink-850 px-6 py-10 text-center transition hover:border-gold-600"
        >
          <Upload className="mb-2 h-7 w-7 text-gold-500" />
          <p className="text-sm font-medium">Arraste os vídeos aqui ou toque para escolher</p>
          <p className="mt-1 text-xs text-neutral-500">MP4, MOV, WEBM, MKV · até {capabilities.maxUploadMb >= 1024 ? `${(capabilities.maxUploadMb / 1024).toFixed(0)} GB` : `${capabilities.maxUploadMb} MB`} por arquivo</p>
          <input ref={input} type="file" accept="video/*,.mkv" multiple hidden onChange={(e) => addFiles(e.target.files)} />
        </div>
        {files.length > 0 && (
          <ul className="mt-3 space-y-2">
            {files.map((f) => (
              <li key={f.name + f.size} className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
                <Film className="h-4 w-4 text-gold-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{f.name}</span>
                  {phase === "uploading" ? <Progress value={progress[f.name] ?? 0} className="mt-1" /> : <span className="text-xs text-neutral-500">{fmtBytes(f.size)}</span>}
                </span>
                {progress[f.name] === 1 && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                {!busy && (
                  <button onClick={() => setFiles((c) => c.filter((x) => x !== f))} className="text-neutral-500 hover:text-white" aria-label="Remover"><X className="h-4 w-4" /></button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <label className="label" htmlFor="pname">Nome do projeto</label>
          <input id="pname" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Corte degradê — Reels" maxLength={120} />
        </div>
      </Step>

      <Step n={2} title="Selecione a marca">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {brands.map((b) => (
            <button key={b.id} onClick={() => setBrandId(b.id)} className={cx("rounded-xl border p-3 text-left transition", brandId === b.id ? "border-gold-600 bg-gold-700/10" : "border-ink-700 bg-ink-850 hover:border-ink-600")}>
              <div className="flex items-center gap-2">
                <span className="flex -space-x-1">{b.colors.slice(0, 3).map((c) => <span key={c} className="h-3.5 w-3.5 rounded-full border border-ink-950" style={{ background: c }} />)}</span>
                <span className="truncate text-sm font-medium">{b.name}</span>
              </div>
              <p className="mt-1 line-clamp-1 text-xs text-neutral-500">{b.segment}</p>
              {!b.logoUrl && <p className="mt-1 text-[11px] text-amber-300/80">Logo oficial não enviada</p>}
            </button>
          ))}
          <button onClick={() => setBrandId(null)} className={cx("rounded-xl border p-3 text-left text-sm transition", brandId === null ? "border-gold-600 bg-gold-700/10" : "border-ink-700 bg-ink-850 hover:border-ink-600")}>Sem marca</button>
        </div>
        {brand && <p className="mt-2 text-xs text-neutral-500">Tom: {brand.tone}. A marca pode ser alterada depois no estúdio.</p>}
      </Step>

      <Step n={3} title="Escolha os destinos">
        <div className="grid gap-4 sm:grid-cols-3">
          {(Object.keys(DESTINATIONS) as Array<keyof typeof DESTINATIONS>).map((pl) => (
            <div key={pl}>
              <p className="mb-2 text-xs font-medium text-neutral-400">{PLATFORM_LABEL[pl]}</p>
              <div className="space-y-1.5">
                {DESTINATIONS[pl].map((p) => (
                  <label key={p} className={cx("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", presets.includes(p) ? "border-gold-600 bg-gold-700/10" : "border-ink-700 bg-ink-850")}>
                    <input type="checkbox" checked={presets.includes(p)} onChange={() => togglePreset(p)} className="accent-[#D4AF37]" />
                    {FORMAT_PRESETS[p].label.replace(`${PLATFORM_LABEL[pl]} `, "")}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-500">O primeiro formato selecionado é o principal do editor; os demais são gerados na exportação em lote.</p>
      </Step>

      {!editorMode && (
        <Step n={4} title="Template (opcional)">
          <select className="input" value={templateId ?? ""} onChange={(e) => {
            const t = templates.find((x) => x.id === e.target.value) ?? null;
            setTemplateId(t?.id ?? null);
            if (t?.config.preset && !presets.includes(t.config.preset)) setPresets([t.config.preset, ...presets]);
          }}>
            <option value="">Nenhum — só o comando para a IA</option>
            {[...new Set(templates.map((t) => t.category))].map((cat) => (
              <optgroup key={cat} label={cat}>
                {templates.filter((t) => t.category === cat).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            ))}
          </select>
          {templateId && <p className="mt-2 text-xs text-neutral-500">{templates.find((t) => t.id === templateId)?.description} O template é aplicado antes do seu comando.</p>}
        </Step>
      )}

      <Step n={editorMode ? 4 : 5} title="Estilo (opcional)">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setStyleId(null)} className={cx("rounded-full border px-3 py-1 text-xs", styleId === null ? "border-gold-600 bg-gold-700/20 text-gold-300" : "border-ink-700 text-neutral-400")}>Padrão da marca</button>
          {Object.values(EDIT_STYLES).map((s) => (
            <button key={s.id} title={s.description} onClick={() => setStyleId(s.id)} className={cx("rounded-full border px-3 py-1 text-xs", styleId === s.id ? "border-gold-600 bg-gold-700/20 text-gold-300" : "border-ink-700 text-neutral-400 hover:text-white")}>{s.label}</button>
          ))}
        </div>
      </Step>

      {!editorMode && (
        <Step n={6} title="Diga à IA o que fazer">
          <textarea className="input min-h-[110px] resize-y" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Ex.: Crie um Reels de 40 segundos, selecione as melhores cenas, adicione legendas automáticas e finalize com a logo." maxLength={4000} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => setCommand(ex)} className="rounded-full border border-ink-700 px-2.5 py-1 text-left text-[11px] text-neutral-400 hover:border-ink-500 hover:text-white">{ex.length > 60 ? `${ex.slice(0, 58)}…` : ex}</button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={autoRender} onChange={(e) => setAutoRender(e.target.checked)} className="accent-[#D4AF37]" /> Renderizar automaticamente ao final</label>
            <label className="flex items-center gap-2">Resolução
              <select className="input w-auto py-1" value={resolution} onChange={(e) => setResolution(e.target.value as typeof resolution)}>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="2160p">4K (se a origem permitir)</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {!capabilities.ai && <Badge tone="warn">IA não configurada: comandos usarão o interpretador local (pedidos comuns)</Badge>}
            {!capabilities.transcription && <Badge tone="warn">Transcrição não configurada: legendas automáticas indisponíveis</Badge>}
          </div>
        </Step>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      {phase === "uploading" && (
        <div className="panel p-4">
          <p className="mb-2 text-sm">Enviando vídeos… {Math.round(totalProgress * 100)}%</p>
          <Progress value={totalProgress} />
          <p className="mt-2 text-xs text-neutral-500">Não feche esta página até o envio terminar. O processamento continua no servidor depois disso.</p>
        </div>
      )}
      <div className="sticky bottom-16 z-10 flex justify-end lg:bottom-4">
        <Button variant="primary" size="lg" onClick={submit} loading={busy} className="w-full shadow-xl sm:w-auto">
          {editorMode ? <Wand2 className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
          {editorMode ? "Criar e abrir no editor" : "Criar vídeo com IA"}
        </Button>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <h2 className="mb-4 flex items-center gap-2 font-medium">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-gold-500 text-xs font-bold text-ink-950">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
