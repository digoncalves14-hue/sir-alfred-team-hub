"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Music2, Plus, Trash2, Upload } from "lucide-react";
import { EDIT_STYLES } from "@vision/core";
import type { AssetDto, BrandDto } from "@/lib/dto";
import { apiFetch } from "@/lib/client";
import { uploadFile } from "@/lib/upload-client";
import { Alert, Button, Progress } from "./ui";

const FONT_OPTIONS = ["Montserrat", "Open Sans", "Fredoka", "Inter", "Playfair Display", "Bebas Neue"];

export function BrandEditor({ brand, files }: { brand: BrandDto; files: AssetDto[] }) {
  const router = useRouter();
  const logoInput = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: brand.name,
    segment: brand.segment,
    tone: brand.tone,
    contentTypes: brand.contentTypes.join(", "),
    colors: brand.colors.length ? brand.colors : ["#0B0B0C"],
    fonts: brand.fonts,
    defaultStyleId: brand.defaultStyleId ?? "",
    notes: brand.notes ?? "",
  });
  const [license, setLicense] = useState("");
  const [upload, setUpload] = useState<{ what: string; p: number } | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const music = files.filter((f) => f.role === "music");

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch(`/api/brands/${brand.id}`, {
        method: "PATCH",
        json: {
          name: form.name,
          segment: form.segment,
          tone: form.tone,
          contentTypes: form.contentTypes.split(",").map((s) => s.trim()).filter(Boolean),
          colors: form.colors,
          fonts: form.fonts,
          defaultStyleId: form.defaultStyleId || null,
          notes: form.notes || null,
        },
      });
      setMsg({ tone: "success", text: "Marca atualizada." });
      router.refresh();
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const send = async (file: File | undefined, role: "logo" | "music") => {
    if (!file) return;
    if (role === "music" && !license.trim()) {
      setMsg({ tone: "error", text: "Informe a licença ou autorização de uso da música." });
      return;
    }
    try {
      setUpload({ what: file.name, p: 0 });
      await uploadFile(file, { role, brandId: brand.id, licenseNote: role === "music" ? license.trim() : null, onProgress: (p) => setUpload({ what: file.name, p }) });
      setMsg({ tone: "info", text: role === "logo" ? "Logo enviada. Ela será validada e aplicada em instantes." : "Música enviada. Ela ficará disponível após o processamento." });
      setLicense("");
      setTimeout(() => router.refresh(), 2500);
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setUpload(null);
    }
  };

  const removeAsset = async (id: string) => {
    try {
      await apiFetch(`/api/assets/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="panel space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Segmento"><input className="input" value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} /></Field>
        </div>
        <Field label="Comunicação / tom de voz"><input className="input" value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} /></Field>
        <Field label="Tipos de conteúdo (separados por vírgula)"><input className="input" value={form.contentTypes} onChange={(e) => setForm({ ...form, contentTypes: e.target.value })} /></Field>
        <Field label="Cores da identidade">
          <div className="flex flex-wrap items-center gap-2">
            {form.colors.map((c, i) => (
              <span key={i} className="flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-850 p-1 pr-2">
                <input type="color" value={c} onChange={(e) => setForm({ ...form, colors: form.colors.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)) })} className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent" />
                <span className="font-mono text-xs">{c}</span>
                <button onClick={() => setForm({ ...form, colors: form.colors.filter((_, j) => j !== i) })} className="text-neutral-500 hover:text-red-300" aria-label="Remover cor"><Trash2 className="h-3 w-3" /></button>
              </span>
            ))}
            {form.colors.length < 8 && <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, colors: [...form.colors, "#D4AF37"] })}><Plus className="h-3.5 w-3.5" /> Cor</Button>}
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">A primeira cor é usada como fundo da cartela final com a logo.</p>
        </Field>
        <Field label="Fontes">
          <div className="flex flex-wrap gap-1.5">
            {FONT_OPTIONS.map((f) => (
              <button key={f} onClick={() => setForm({ ...form, fonts: form.fonts.includes(f) ? form.fonts.filter((x) => x !== f) : [...form.fonts, f].slice(0, 4) })} className={`rounded-full border px-3 py-1 text-xs ${form.fonts.includes(f) ? "border-gold-600 bg-gold-700/20 text-gold-200" : "border-ink-700 text-neutral-400"}`}>{f}</button>
            ))}
          </div>
        </Field>
        <Field label="Estilo padrão de edição">
          <select className="input" value={form.defaultStyleId} onChange={(e) => setForm({ ...form, defaultStyleId: e.target.value })}>
            <option value="">Nenhum</option>
            {Object.values(EDIT_STYLES).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Observações (mascotes, regras de uso…)"><textarea className="input min-h-[80px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div className="flex justify-end"><Button variant="primary" onClick={save} loading={saving}>Salvar marca</Button></div>
      </div>

      <div className="space-y-4">
        <div className="panel p-5">
          <p className="label">Logo oficial</p>
          <div className="grid aspect-video place-items-center overflow-hidden rounded-lg border border-ink-700" style={{ background: form.colors[0] ?? "#111" }}>
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt="Logo oficial" className="max-h-full max-w-full object-contain p-3" />
            ) : (
              <span className="text-xs text-neutral-400">Nenhuma logo enviada</span>
            )}
          </div>
          <Button className="mt-3 w-full" onClick={() => logoInput.current?.click()} disabled={!!upload}><Upload className="h-4 w-4" /> {brand.logoUrl ? "Substituir logo" : "Enviar logo oficial"}</Button>
          <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void send(e.target.files?.[0], "logo")} />
          <p className="mt-2 text-[11px] text-neutral-500">PNG com fundo transparente recomendado. A IA nunca gera ou altera a logo.</p>
        </div>
        <div className="panel p-5">
          <p className="label">Músicas e vinhetas licenciadas</p>
          <ul className="mb-3 space-y-1.5">
            {music.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-2 py-1.5 text-xs">
                <Music2 className="h-3.5 w-3.5 text-gold-500" />
                <span className="min-w-0 flex-1"><span className="block truncate">{m.name}</span><span className="block truncate text-[10px] text-neutral-500">{m.status === "ready" ? `Licença: ${m.licenseNote}` : m.status === "error" ? m.errorMessage : "Processando…"}</span></span>
                <button onClick={() => removeAsset(m.id)} className="text-neutral-500 hover:text-red-300" aria-label="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
            {!music.length && <li className="text-xs text-neutral-500">Nenhuma música cadastrada.</li>}
          </ul>
          <input className="input mb-2" placeholder="Licença / autorização (obrigatório)" value={license} onChange={(e) => setLicense(e.target.value)} />
          <Button className="w-full" size="sm" onClick={() => musicInput.current?.click()} disabled={!!upload}><Upload className="h-3.5 w-3.5" /> Enviar música</Button>
          <input ref={musicInput} type="file" accept="audio/*" hidden onChange={(e) => void send(e.target.files?.[0], "music")} />
        </div>
        {upload && (
          <div className="panel p-4 text-xs">
            <p className="mb-1 truncate">{upload.what}</p>
            <Progress value={upload.p} />
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}
