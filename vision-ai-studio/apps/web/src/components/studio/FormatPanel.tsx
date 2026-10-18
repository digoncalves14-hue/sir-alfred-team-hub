"use client";
import { useEffect, useState } from "react";
import { LayoutTemplate, Save } from "lucide-react";
import type { TemplateDef } from "@vision/core";
import { apiFetch } from "@/lib/client";
import { Button } from "../ui";
import { DESTINATIONS, EDIT_STYLES, FORMAT_PRESETS, type FormatPresetId, type Timeline } from "@vision/core";
import { cx } from "../ui";
import type { Detail, StudioActions } from "./types";

const PLATFORM = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook" } as const;

/** Formato/proporção, modo de enquadramento e estilo automático. */
export function FormatPanel({ data, timeline, actions }: { data: Detail; timeline: Timeline; actions: StudioActions }) {
  const [templates, setTemplates] = useState<TemplateDef[]>([]);
  const [chosen, setChosen] = useState<string>(data.project.templateId ?? "");
  const [busy, setBusy] = useState(false);
  const [saveName, setSaveName] = useState("");
  useEffect(() => {
    apiFetch<{ templates: TemplateDef[] }>("/api/templates").then((r) => setTemplates(r.templates)).catch(() => {});
  }, []);
  const apply = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ applied: string[]; notes: string[] }>(`/api/projects/${data.project.id}/template`, { method: "POST", json: { templateId: chosen } });
      actions.notify([r.applied.length ? `Template aplicado: ${r.applied.length} ajustes.` : "Template aplicado.", ...r.notes].join(" "), r.notes.length ? "warn" : "success");
      await actions.refresh();
    } catch (e) {
      actions.notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (saveName.trim().length < 2) return actions.notify("Dê um nome ao template.", "warn");
    try {
      await apiFetch("/api/templates", { method: "POST", json: { name: saveName.trim(), fromProjectId: data.project.id } });
      setSaveName("");
      setTemplates((await apiFetch<{ templates: TemplateDef[] }>("/api/templates")).templates);
      actions.notify("Template salvo em “Templates”.", "success");
    } catch (e) {
      actions.notify((e as Error).message, "error");
    }
  };
  const current = templates.find((t) => t.id === chosen);
  const auto = timeline.clips.filter((c) => c.focusSource === "auto_motion").length;
  const manual = timeline.clips.filter((c) => c.focusSource === "manual").length;
  return (
    <div className="space-y-5 p-4">
      <div>
        <p className="label">Template</p>
        <div className="flex gap-2">
          <select className="input" value={chosen} onChange={(e) => setChosen(e.target.value)}>
            <option value="">Escolha um template…</option>
            {[...new Set(templates.map((t) => t.category))].map((cat) => (
              <optgroup key={cat} label={cat}>
                {templates.filter((t) => t.category === cat).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            ))}
          </select>
          <Button onClick={apply} loading={busy} disabled={!chosen}><LayoutTemplate className="h-4 w-4" /> Aplicar</Button>
        </div>
        {current && <p className="mt-1 text-[11px] text-neutral-500">{current.description}{current.config.targetDurationSec ? ` · ${current.config.targetDurationSec}s` : ""}</p>}
        <div className="mt-2 flex gap-2">
          <input className="input py-1 text-xs" placeholder="Salvar esta edição como template…" value={saveName} onChange={(e) => setSaveName(e.target.value)} maxLength={80} />
          <Button size="sm" onClick={save}><Save className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      <div>
        <p className="label">Formato</p>
        <div className="space-y-3">
          {(Object.keys(DESTINATIONS) as Array<keyof typeof DESTINATIONS>).map((pl) => (
            <div key={pl}>
              <p className="mb-1 text-[11px] text-neutral-500">{PLATFORM[pl]}</p>
              <div className="flex flex-wrap gap-1.5">
                {DESTINATIONS[pl].map((p: FormatPresetId) => (
                  <button key={p} onClick={() => p !== timeline.format.preset && void actions.runOps([{ op: "set_format", preset: p }])} className={cx("rounded-lg border px-2.5 py-1.5 text-xs", timeline.format.preset === p ? "border-gold-600 bg-gold-700/20 text-gold-200" : "border-ink-700 text-neutral-300 hover:border-ink-500")}>
                    {FORMAT_PRESETS[p].label.replace(`${PLATFORM[pl]} `, "")}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="label">Enquadramento</p>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            ["fill", "Preencher", "Recorte inteligente"],
            ["fit_blur", "Fundo desfocado", "Vídeo inteiro"],
            ["fit", "Barras", "Vídeo inteiro"],
          ] as const).map(([id, label, sub]) => (
            <button key={id} onClick={() => id !== timeline.format.reframe && void actions.runOps([{ op: "set_reframe", mode: id }])} className={cx("rounded-lg border px-2 py-2 text-left text-xs", timeline.format.reframe === id ? "border-gold-600 bg-gold-700/20" : "border-ink-700 hover:border-ink-500")}>
              <span className="block font-medium">{label}</span>
              <span className="text-[10px] text-neutral-500">{sub}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          No modo “Preencher”, cada trecho é centralizado na região com mais movimento detectado ({auto} automáticos, {manual} manuais, {timeline.clips.length - auto - manual} centralizados).
          Não há rastreamento de pessoas nesta versão; ajuste manualmente selecionando o trecho na timeline (modo avançado).
        </p>
      </div>
      <div>
        <p className="label">Estilo automático</p>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.values(EDIT_STYLES).map((s) => (
            <button key={s.id} title={s.description} onClick={() => s.id !== timeline.styleId && void actions.runOps([{ op: "set_style", style_id: s.id }])} className={cx("rounded-lg border px-2.5 py-2 text-left text-xs", timeline.styleId === s.id ? "border-gold-600 bg-gold-700/20" : "border-ink-700 hover:border-ink-500")}>
              <span className="block font-medium">{s.label}</span>
              <span className="line-clamp-2 text-[10px] text-neutral-500">{s.description}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-500">O estilo define ritmo dos cortes automáticos, legenda e enquadramento. Transições e efeitos visuais chegam na Fase 3.</p>
      </div>
    </div>
  );
}
