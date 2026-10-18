"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, AudioLines, Bot, Download, Film, FolderOpen, History, Loader2, Redo2, Ratio, Subtitles, Undo2 } from "lucide-react";
import { JOB_TYPE_LABEL, timelineDuration, type JobType, type Timeline } from "@vision/core";
import { apiFetch } from "@/lib/client";
import type { BrandDto } from "@/lib/dto";
import { fmtDuration } from "@/lib/format";
import { Alert, Button, Progress, StatusBadge, cx } from "../ui";
import { AssistantPanel } from "./AssistantPanel";
import { AudioPanel } from "./AudioPanel";
import { CaptionsPanel } from "./CaptionsPanel";
import { ExportPanel } from "./ExportPanel";
import { FilesPanel } from "./FilesPanel";
import { FormatPanel } from "./FormatPanel";
import { PreviewPlayer, type PlayerHandle } from "./PreviewPlayer";
import { TimelineView } from "./TimelineView";
import { VersionsPanel } from "./VersionsPanel";
import type { Detail, StudioActions } from "./types";

type Tab = "assistant" | "captions" | "format" | "audio" | "export" | "versions" | "files";
const TABS: Array<{ id: Tab; label: string; icon: typeof Bot; auto: boolean }> = [
  { id: "assistant", label: "Assistente", icon: Bot, auto: true },
  { id: "captions", label: "Legendas", icon: Subtitles, auto: false },
  { id: "format", label: "Formato", icon: Ratio, auto: false },
  { id: "audio", label: "Áudio e logo", icon: AudioLines, auto: false },
  { id: "export", label: "Exportar", icon: Download, auto: true },
  { id: "versions", label: "Versões", icon: History, auto: true },
  { id: "files", label: "Arquivos", icon: FolderOpen, auto: true },
];

export function Studio({ initial, brands }: { initial: Detail; brands: BrandDto[] }) {
  const [data, setData] = useState(initial);
  const [mode, setMode] = useState<"auto" | "advanced">(initial.project.kind === "editor" ? "advanced" : "auto");
  const [tab, setTab] = useState<Tab>("assistant");
  const [time, setTime] = useState(0);
  const [toast, setToast] = useState<{ msg: string; tone: "info" | "error" | "success" | "warn" } | null>(null);
  const [rendered, setRendered] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const player = useRef<PlayerHandle>(null);
  const id = data.project.id;

  const refresh = useCallback(async () => {
    try {
      setData(await apiFetch<Detail>(`/api/projects/${id}`));
    } catch {
      /* mantém o último estado */
    }
  }, [id]);

  const active = data.jobs.some((j) => j.status === "queued" || j.status === "running") || data.commands.some((c) => c.status === "queued" || c.status === "running");
  useEffect(() => {
    const t = setInterval(refresh, active ? 1500 : 8000);
    return () => clearInterval(t);
  }, [active, refresh]);

  const notify = useCallback((msg: string, tone: "info" | "error" | "success" | "warn" = "info") => {
    setToast({ msg, tone });
    setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), 6000);
  }, []);

  const actions: StudioActions = useMemo(
    () => ({
      refresh,
      notify,
      seek: (t) => player.current?.seek(t),
      commitTimeline: async (tl: Timeline, summary: string) => {
        setSaving(true);
        setData((d) => ({ ...d, timeline: tl }));
        try {
          await apiFetch(`/api/projects/${id}/versions`, { method: "POST", json: { timeline: tl, summary, baseVersionId: data.currentVersion?.id ?? null } });
        } catch (e) {
          notify((e as Error).message, "error");
        } finally {
          setSaving(false);
          await refresh();
        }
      },
      runOps: async (ops, summary) => {
        setSaving(true);
        try {
          const r = await apiFetch<{ changed: boolean; warnings: string[]; unsupported: Array<{ request: string; reason: string }>; applied: string[] }>(`/api/projects/${id}/operations`, {
            method: "POST",
            json: { operations: ops, summary, baseVersionId: data.currentVersion?.id ?? null },
          });
          if (r.unsupported.length) notify(r.unsupported.map((u) => u.reason).join(" "), "warn");
          else if (r.warnings.length) notify(r.warnings.join(" "), "warn");
          else if (r.applied.length) notify(r.applied.join(" "), "success");
          return r;
        } catch (e) {
          notify((e as Error).message, "error");
        } finally {
          setSaving(false);
          await refresh();
        }
      },
    }),
    [id, refresh, notify, data.currentVersion?.id],
  );

  const patchProject = async (body: Record<string, unknown>) => {
    try {
      await apiFetch(`/api/projects/${id}`, { method: "PATCH", json: body });
      await refresh();
    } catch (e) {
      notify((e as Error).message, "error");
    }
  };
  const undoRedo = async (what: "undo" | "redo") => {
    try {
      await apiFetch(`/api/projects/${id}/${what}`, { method: "POST" });
      await refresh();
    } catch (e) {
      notify((e as Error).message, "warn");
    }
  };

  const tl = data.timeline;
  const tabs = TABS.filter((t) => mode === "advanced" || t.auto);
  const currentTab = tabs.some((t) => t.id === tab) ? tab : "assistant";
  const runningJobs = data.jobs.filter((j) => j.status === "running" || j.status === "queued");
  const lastRender = data.renders.find((r) => r.status === "succeeded" && r.versionId === data.currentVersion?.id && r.playUrl);

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col lg:h-screen lg:min-h-0">
      <header className="flex flex-wrap items-center gap-2 border-b border-ink-800 bg-ink-950 px-3 py-2 sm:px-4">
        <Link href="/projetos" className="rounded-md p-1.5 text-neutral-400 hover:bg-ink-800 hover:text-white" aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></Link>
        <input
          className="min-w-0 max-w-[260px] flex-1 truncate rounded bg-transparent px-1 text-sm font-semibold outline-none focus:bg-ink-850"
          defaultValue={data.project.name}
          onBlur={(e) => e.target.value.trim() && e.target.value !== data.project.name && patchProject({ name: e.target.value.trim() })}
          aria-label="Nome do projeto"
        />
        <StatusBadge status={data.project.status} label={data.project.statusLabel} />
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-gold-500" />}
        <select className="input w-auto py-1 text-xs" value={data.project.brandId ?? ""} onChange={(e) => patchProject({ brandId: e.target.value || null })} aria-label="Marca">
          <option value="">Sem marca</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => undoRedo("undo")} title="Desfazer"><Undo2 className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => undoRedo("redo")} title="Refazer"><Redo2 className="h-4 w-4" /></Button>
          <div className="ml-1 flex rounded-lg border border-ink-700 p-0.5 text-xs">
            <button onClick={() => setMode("auto")} className={cx("rounded-md px-2.5 py-1", mode === "auto" ? "bg-gold-500 font-semibold text-ink-950" : "text-neutral-400")}>Edição automática</button>
            <button onClick={() => setMode("advanced")} className={cx("rounded-md px-2.5 py-1", mode === "advanced" ? "bg-gold-500 font-semibold text-ink-950" : "text-neutral-400")}>Editor avançado</button>
          </div>
        </div>
      </header>
      {data.project.status === "error" && data.project.errorMessage && (
        <div className="border-b border-red-900/40 bg-red-950/30 px-4 py-2 text-sm text-red-100">
          Erro no processamento: {data.project.errorMessage} <button className="ml-2 underline" onClick={() => setTab("files")}>Ver detalhes e tentar novamente</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className={cx("flex h-[64vh] flex-col p-3 lg:min-h-0", mode === "advanced" ? "lg:h-[58%]" : "lg:h-auto lg:flex-1")}>
            {tl && (
              <div className="mb-2 flex items-center gap-2 text-xs">
                <button onClick={() => setRendered(null)} className={cx("rounded-md px-2 py-1", !rendered ? "bg-ink-800 text-white" : "text-neutral-500")}>Prévia em tempo real</button>
                {(rendered || lastRender) && <button onClick={() => setRendered(rendered ?? lastRender!.playUrl)} className={cx("rounded-md px-2 py-1", rendered ? "bg-ink-800 text-white" : "text-neutral-500")}>Resultado renderizado</button>}
                <span className="ml-auto hidden text-neutral-500 sm:inline">Versão {data.currentVersion?.number} · {fmtDuration(timelineDuration(tl))} · {tl.clips.length} trechos</span>
              </div>
            )}
            <div className="min-h-0 flex-1">
              {rendered ? (
                <video key={rendered} src={rendered} controls autoPlay className="h-full w-full rounded-xl bg-black object-contain" />
              ) : tl ? (
                <PreviewPlayer ref={player} timeline={tl} assets={data.assets} onTime={setTime} />
              ) : (
                <div className="grid h-full place-items-center rounded-xl border border-ink-800 bg-ink-900 p-6">
                  <div className="w-full max-w-md text-center">
                    <Film className="mx-auto mb-3 h-8 w-8 text-gold-500" />
                    <p className="font-medium">{data.assets.some((a) => a.role === "source") ? "Processando seus vídeos…" : "Nenhum vídeo enviado ainda"}</p>
                    <p className="mt-1 text-sm text-neutral-400">{data.assets.some((a) => a.role === "source") ? "Leitura técnica, miniatura e análise de cenas, silêncio e movimento." : "Adicione vídeos na aba Arquivos."}</p>
                    <div className="mt-4 space-y-2 text-left">
                      {runningJobs.map((j) => (
                        <div key={j.id} className="text-xs">
                          <div className="mb-1 flex justify-between text-neutral-400"><span>{j.stage ?? JOB_TYPE_LABEL[j.type as JobType]}</span><span>{Math.round(j.progress * 100)}%</span></div>
                          <Progress value={j.progress} />
                        </div>
                      ))}
                    </div>
                    {!data.assets.some((a) => a.role === "source") && <Button className="mt-4" onClick={() => setTab("files")}>Abrir arquivos</Button>}
                  </div>
                </div>
              )}
            </div>
            {data.project.autopilot && data.project.autopilot.stage !== "done" && data.project.autopilot.stage !== "failed" && (
              <Alert>
                <span className="text-xs">
                  Criação automática: {{ waiting_analysis: "analisando os vídeos", planning: "a IA está montando a edição", rendering: "renderizando o vídeo final" }[data.project.autopilot.stage]}…
                  {" "}Pedido: “{data.project.autopilot.command}”
                </span>
              </Alert>
            )}
          </div>
          {mode === "advanced" && tl && (
            <div className="min-h-[260px] border-t border-ink-800 bg-ink-950 lg:h-[42%] lg:min-h-0">
              <TimelineView timeline={tl} assets={data.assets} time={time} actions={actions} />
            </div>
          )}
        </div>

        <aside className="flex w-full flex-col border-t border-ink-800 bg-ink-900 lg:w-[400px] lg:border-l lg:border-t-0">
          <div className="scroll-thin flex shrink-0 overflow-x-auto border-b border-ink-800">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={cx("flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs", currentTab === t.id ? "border-gold-500 text-white" : "border-transparent text-neutral-500 hover:text-neutral-200")}>
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {currentTab === "assistant" && <AssistantPanel data={data} actions={actions} />}
            {currentTab === "captions" && tl && <CaptionsPanel data={data} timeline={tl} actions={actions} />}
            {currentTab === "format" && tl && <FormatPanel timeline={tl} actions={actions} />}
            {currentTab === "audio" && tl && <AudioPanel data={data} timeline={tl} actions={actions} />}
            {currentTab === "export" && tl && <ExportPanel data={data} timeline={tl} actions={actions} onPlayRender={setRendered} />}
            {currentTab === "versions" && <VersionsPanel data={data} actions={actions} />}
            {currentTab === "files" && <FilesPanel data={data} actions={actions} />}
            {!tl && ["captions", "format", "audio", "export"].includes(currentTab) && <p className="p-4 text-sm text-neutral-500">Disponível assim que os vídeos forem processados.</p>}
          </div>
        </aside>
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 w-[min(92vw,520px)] -translate-x-1/2 lg:bottom-6">
          <Alert tone={toast.tone}>{toast.msg}</Alert>
        </div>
      )}
    </div>
  );
}
