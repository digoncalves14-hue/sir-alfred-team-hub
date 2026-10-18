"use client";
import { DESTINATIONS, EDIT_STYLES, FORMAT_PRESETS, type FormatPresetId, type Timeline } from "@vision/core";
import { cx } from "../ui";
import type { StudioActions } from "./types";

const PLATFORM = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook" } as const;

/** Formato/proporção, modo de enquadramento e estilo automático. */
export function FormatPanel({ timeline, actions }: { timeline: Timeline; actions: StudioActions }) {
  const auto = timeline.clips.filter((c) => c.focusSource === "auto_motion").length;
  const manual = timeline.clips.filter((c) => c.focusSource === "manual").length;
  return (
    <div className="space-y-5 p-4">
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
