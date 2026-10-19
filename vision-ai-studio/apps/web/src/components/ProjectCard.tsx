"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, Film, FolderInput, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { FORMAT_PRESETS, type FormatPresetId } from "@vision/core";
import type { ProjectCardDto } from "@/lib/dto";
import { apiFetch } from "@/lib/client";
import { fmtDate } from "@/lib/format";
import { Button, Modal, StatusBadge } from "./ui";

export function ProjectCard({ p }: { p: ProjectCardDto }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<null | "rename" | "folder" | "delete">(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setDialog(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group panel relative overflow-hidden">
      <Link href={`/projetos/${p.id}`} className="block">
        <div className="relative aspect-video bg-ink-850">
          {p.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.thumbnailUrl} alt="" className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" />
          ) : (
            <div className="grid h-full place-items-center text-ink-500">
              <Film className="h-8 w-8" />
            </div>
          )}
          <div className="absolute left-2 top-2">
            <StatusBadge status={p.status} label={p.statusLabel} />
          </div>
        </div>
        <div className="p-3">
          <p className="truncate text-sm font-medium text-neutral-100">{p.name}</p>
          <p className="mt-0.5 truncate text-xs text-neutral-500">
            {p.brandName ?? "Sem marca"} · {FORMAT_PRESETS[p.primaryPreset as FormatPresetId]?.label ?? p.primaryPreset}
          </p>
          <p className="mt-1 text-[11px] text-neutral-600">
            {p.folder ? `${p.folder} · ` : ""}Atualizado {fmtDate(p.updatedAt)}
          </p>
          {p.status === "error" && p.errorMessage && <p className="mt-1 line-clamp-2 text-[11px] text-red-300">{p.errorMessage}</p>}
        </div>
      </Link>
      <button onClick={() => setMenu((m) => !m)} className="absolute right-2 top-2 rounded-md bg-black/60 p-1.5 text-neutral-300 opacity-100 transition hover:text-white sm:opacity-0 sm:group-hover:opacity-100" aria-label="Ações">
        <MoreVertical className="h-4 w-4" />
      </button>
      {menu && (
        <div className="absolute right-2 top-10 z-20 w-44 overflow-hidden rounded-lg border border-ink-700 bg-ink-850 py-1 text-sm shadow-xl" onMouseLeave={() => setMenu(false)}>
          <MenuItem icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => { setValue(p.name); setDialog("rename"); setMenu(false); }}>Renomear</MenuItem>
          <MenuItem icon={<Copy className="h-3.5 w-3.5" />} onClick={() => { setMenu(false); void act(() => apiFetch(`/api/projects/${p.id}/duplicate`, { method: "POST" })); }}>Duplicar</MenuItem>
          <MenuItem icon={<FolderInput className="h-3.5 w-3.5" />} onClick={() => { setValue(p.folder ?? ""); setDialog("folder"); setMenu(false); }}>Mover para pasta</MenuItem>
          <MenuItem icon={<Trash2 className="h-3.5 w-3.5 text-red-400" />} onClick={() => { setDialog("delete"); setMenu(false); }}>Excluir</MenuItem>
        </div>
      )}
      <Modal open={dialog === "rename" || dialog === "folder"} onClose={() => setDialog(null)} title={dialog === "rename" ? "Renomear projeto" : "Organizar em pasta"}>
        <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder={dialog === "folder" ? "Ex.: Campanha de verão (vazio = sem pasta)" : ""} autoFocus />
        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setDialog(null)}>Cancelar</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => act(() => apiFetch(`/api/projects/${p.id}`, { method: "PATCH", json: dialog === "rename" ? { name: value } : { folder: value.trim() || null } }))}
          >
            Salvar
          </Button>
        </div>
      </Modal>
      <Modal open={dialog === "delete"} onClose={() => setDialog(null)} title="Excluir projeto?">
        <p className="text-sm text-neutral-400">O projeto “{p.name}” será removido da lista e suas tarefas pendentes serão canceladas.</p>
        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setDialog(null)}>Cancelar</Button>
          <Button variant="danger" loading={busy} onClick={() => act(() => apiFetch(`/api/projects/${p.id}`, { method: "DELETE" }))}>Excluir</Button>
        </div>
      </Modal>
    </div>
  );
}

function MenuItem({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 px-3 py-2 text-left text-neutral-200 hover:bg-ink-700">
      {icon}
      {children}
    </button>
  );
}
