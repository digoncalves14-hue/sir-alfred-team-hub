"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutTemplate, Trash2 } from "lucide-react";
import { CAPTION_STYLES, EDIT_STYLES, FORMAT_PRESETS, type TemplateDef } from "@vision/core";
import { apiFetch } from "@/lib/client";
import { Badge, Button } from "./ui";

const LOGO = { none: "Sem logo", end_card: "Cartela final", watermark: "Logo no canto", both: "Canto + cartela" } as const;

export function TemplatesList({ templates }: { templates: TemplateDef[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const remove = async (id: string) => {
    try {
      await apiFetch(`/api/templates/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const cats = [...new Set(templates.map((t) => t.category))];
  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-300">{error}</p>}
      {cats.map((cat) => (
        <section key={cat}>
          <h2 className="mb-3 font-semibold">{cat}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.filter((t) => t.category === cat).map((t) => (
              <div key={t.id} className="panel p-4">
                <div className="flex items-start gap-2">
                  <LayoutTemplate className="mt-0.5 h-4 w-4 text-gold-500" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-neutral-400">{t.description || "Template salvo a partir de um projeto."}</p>
                  </div>
                  {!t.isSystem && <Button size="sm" variant="ghost" onClick={() => remove(t.id)} aria-label="Excluir"><Trash2 className="h-3.5 w-3.5" /></Button>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="gold">{EDIT_STYLES[t.config.styleId].label}</Badge>
                  {t.config.preset && <Badge>{FORMAT_PRESETS[t.config.preset].label}</Badge>}
                  {t.config.targetDurationSec && <Badge>{t.config.targetDurationSec}s</Badge>}
                  <Badge>{t.config.captions.enabled ? `Legenda: ${t.config.captions.style ? CAPTION_STYLES[t.config.captions.style].label : "do estilo"}` : "Sem legenda"}</Badge>
                  <Badge>{LOGO[t.config.logo]}</Badge>
                  {t.config.removeSilences && <Badge>Sem silêncios</Badge>}
                  {t.config.syncToBeat && <Badge>Cortes na batida</Badge>}
                </div>
                {t.config.aiGuidance && <p className="mt-2 text-[11px] text-neutral-500">Orientação para a IA: {t.config.aiGuidance}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
