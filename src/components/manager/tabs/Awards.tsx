import { useEffect, useMemo, useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { Avatar } from "@/components/Avatar";
import { team } from "@/data/team";
import { usePhotos } from "@/hooks/usePhotos";
import { supabase } from "@/integrations/supabase/client";
import { Send, Scissors, Instagram, ShoppingBag, Crown, Camera, X, Trophy, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";

const initialsOf = (name: string) =>
  name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

const CATEGORIES = [
  { id: "cortes", label: "Maior nº de cortes", icon: Scissors },
  { id: "redes", label: "Maior postagem em redes", icon: Instagram },
  { id: "vendas", label: "Maior venda de produtos", icon: ShoppingBag },
  { id: "trimestre", label: "Prêmio do trimestre", icon: Crown },
] as const;

type CategoryId = typeof CATEGORIES[number]["id"];

type Award = {
  id: number;
  category: CategoryId;
  quarter: string;
  winner: string;
  desc: string;
  active: boolean;
  photo?: string;
};

const currentQuarter = () => {
  const d = new Date();
  return `${Math.floor(d.getMonth() / 3) + 1}º Tri ${d.getFullYear()}`;
};

const QUARTERS = (() => {
  const y = new Date().getFullYear();
  const list: string[] = [];
  for (const yr of [y - 1, y, y + 1]) for (let q = 1; q <= 4; q++) list.push(`${q}º Tri ${yr}`);
  return list;
})();

const CATALOG: { quarter: string; gifts: string[]; grand: string }[] = [
  { quarter: "1º Trimestre", gifts: ["Moletom", "Boné", "Camiseta"], grand: "Tesoura Tondeo" },
  { quarter: "2º Trimestre", gifts: ["Chinelo", "Mochila", "Necessaire"], grand: "Máquina Shaver WMark NG 7982" },
  { quarter: "3º Trimestre", gifts: ["Squeeze", "Nano Spray WMark", "Tapete Magnético"], grand: "Máquina Acabamento WMark NG 2033" },
  { quarter: "4º Trimestre", gifts: ["Porta Pente + Lâmina", "Navalha Austin", "Navalhete Desfiadeira"], grand: "Mini Soprador WMark TB 001" },
];

export default function Awards() {
  const { getPhoto } = usePhotos();
  const [tab, setTab] = useState<CategoryId>("cortes");
  const [list, setList] = useState<Award[]>([]);
  const [quarter, setQuarter] = useState(currentQuarter());
  const [winner, setWinner] = useState(team[0]?.name ?? "");
  const [desc, setDesc] = useState("");
  const [photo, setPhoto] = useState<string>("");
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [catalogPhotos, setCatalogPhotos] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem("awards.catalogPhotos");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const loadCatalogPhotos = async () => {
      const { data, error } = await supabase
        .from("award_catalog_photos" as any)
        .select("item_key, photo_path");

      if (error) return;

      const next: Record<string, string> = {};
      (data ?? []).forEach((row: any) => {
        if (!row.item_key || !row.photo_path) return;
        const { data: signed } = supabase.storage
          .from("award-photos")
          .getPublicUrl(row.photo_path);
        next[row.item_key] = `${signed.publicUrl}?t=${Date.now()}`;
      });

      setCatalogPhotos((prev) => ({ ...prev, ...next }));
    };

    loadCatalogPhotos();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("awards.catalogPhotos", JSON.stringify(catalogPhotos));
    } catch {
      // ignore quota errors
    }
  }, [catalogPhotos]);

  const current = CATEGORIES.find((c) => c.id === tab)!;
  const CatIcon = current.icon;
  const filtered = useMemo(() => list.filter((a) => a.category === tab), [list, tab]);

  const onPickPhoto = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
  };

  const onPickCatalogPhoto = async (key: string, file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem");
      return;
    }

    setUploadingKey(key);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const safeKey = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
      const path = `${safeKey}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("award-photos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase
        .from("award_catalog_photos" as any)
        .upsert({ item_key: key, photo_path: path });
      if (dbErr) throw dbErr;

      const { data } = supabase.storage.from("award-photos").getPublicUrl(path);
      setCatalogPhotos((p) => ({ ...p, [key]: `${data.publicUrl}?t=${Date.now()}` }));
      toast.success("Foto do prêmio salva!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar foto do prêmio");
    } finally {
      setUploadingKey(null);
    }
  };

  const removeCatalogPhoto = async (key: string) => {
    setUploadingKey(key);
    try {
      const { data } = await supabase
        .from("award_catalog_photos" as any)
        .select("photo_path")
        .eq("item_key", key)
        .maybeSingle();

      if ((data as any)?.photo_path) {
        await supabase.storage.from("award-photos").remove([(data as any).photo_path]);
      }

      const { error } = await supabase
        .from("award_catalog_photos" as any)
        .delete()
        .eq("item_key", key);
      if (error) throw error;

      setCatalogPhotos((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
      toast.success("Foto removida");
    } catch (e: any) {
      toast.error(e.message || "Erro ao remover foto");
    } finally {
      setUploadingKey(null);
    }
  };

  const send = () => {
    if (!winner.trim()) return;
    setList([
      { id: Date.now(), category: tab, quarter, winner, desc, active: true, photo: photo || undefined },
      ...list.map((a) => (a.category === tab ? { ...a, active: false } : a)),
    ]);
    setDesc("");
    setPhoto("");
  };

  return (
    <div className="space-y-6">
      <SectionTitle title="Prêmios" subtitle="Premiações trimestrais por categoria" />

      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const isActive = tab === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setTab(c.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                isActive ? "gradient-gold text-background shadow-gold" : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {c.label}
            </button>
          );
        })}
      </div>

      <Card>
        <div className="flex items-center gap-2 text-gold mb-3">
          <CatIcon className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-widest">{current.label}</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)} className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm">
            {QUARTERS.map((q) => <option key={q}>{q}</option>)}
          </select>
          {team.length ? (
            <select value={winner} onChange={(e) => setWinner(e.target.value)} className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm">
              {team.map((t) => <option key={t.id}>{t.name}</option>)}
            </select>
          ) : (
            <input value={winner} onChange={(e) => setWinner(e.target.value)} placeholder="Nome do premiado" className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm" />
          )}
        </div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder={tab === "trimestre" ? "Descrição do prêmio do trimestre..." : "Descrição / valor conquistado..."} className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm" />

        <div className="mt-3 flex items-center gap-3">
          {photo ? (
            <div className="relative">
              <img src={photo} alt="Prévia do prêmio" className="h-20 w-20 rounded-xl object-cover border border-gold/40" />
              <button onClick={() => setPhoto("")} className="absolute -top-2 -right-2 bg-background border border-border rounded-full p-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <label className="h-20 w-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:text-gold hover:border-gold/60 cursor-pointer transition">
              <Camera className="h-5 w-5" />
              <span className="text-[10px] mt-1">Foto</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPickPhoto(e.target.files?.[0])} />
            </label>
          )}
          <p className="text-xs text-muted-foreground">Tire ou envie uma foto do prêmio (opcional).</p>
        </div>

        <button onClick={send} className="mt-3 gradient-gold text-background font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 hover:scale-105 transition">
          <Send className="h-4 w-4" /> Publicar premiação
        </button>
      </Card>

      {/* Catálogo de Prêmios */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
          <div className="flex items-center gap-2 text-gold">
            <Trophy className="h-5 w-5" />
            <h3 className="text-lg font-black uppercase tracking-widest">Catálogo de Prêmios</h3>
          </div>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
        </div>
        <p className="text-center text-xs text-muted-foreground">Prêmios oficiais organizados por trimestre</p>

        {/* Prêmio Anual em destaque */}
        <Card className="border-2 border-gold shadow-gold overflow-hidden relative">
          <div className="absolute inset-0 gradient-gold opacity-5 pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row items-center gap-5">
            <div className="flex-shrink-0">
              {catalogPhotos["annual"] ? (
                <div className="relative">
                  <img src={catalogPhotos["annual"]} alt="Combo VGR V 640 S4" className="h-32 w-32 sm:h-40 sm:w-40 rounded-2xl object-cover border-2 border-gold" />
                  <button onClick={() => removeCatalogPhoto("annual")} disabled={uploadingKey === "annual"} className="absolute -top-2 -right-2 bg-background border border-border rounded-full p-1 hover:text-destructive disabled:opacity-60">
                    {uploadingKey === "annual" ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                  </button>
                </div>
              ) : (
                <label className="h-32 w-32 sm:h-40 sm:w-40 rounded-2xl border-2 border-dashed border-gold/60 flex flex-col items-center justify-center text-gold hover:bg-gold/10 cursor-pointer transition">
                  {uploadingKey === "annual" ? <Loader2 className="h-10 w-10 animate-spin" /> : <Gift className="h-10 w-10" />}
                  <span className="text-[10px] mt-2 uppercase tracking-widest">Adicionar foto</span>
                  <input type="file" accept="image/*" disabled={uploadingKey === "annual"} className="hidden" onChange={(e) => onPickCatalogPhoto("annual", e.target.files?.[0])} />
                </label>
              )}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <Badge className="bg-gold/20 text-gold border-gold/60 mb-2">🏆 Prêmio Anual</Badge>
              <h4 className="text-2xl sm:text-3xl font-black text-gold">Combo VGR V 640 S4 4 em 1</h4>
              <p className="text-sm text-muted-foreground mt-2">Corte, acabamento, shaver e secador — o destaque máximo da temporada.</p>
            </div>
          </div>
        </Card>

        {/* Trimestres */}
        <div className="grid md:grid-cols-2 gap-4">
          {CATALOG.map((q) => (
            <Card key={q.quarter} className="border-gold/30 hover:border-gold/60 transition">
              <div className="flex items-center gap-2 mb-4">
                <Crown className="h-4 w-4 text-gold" />
                <h4 className="font-black uppercase tracking-widest text-gold text-sm">{q.quarter}</h4>
              </div>

              {/* Brindes */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Gift className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Brindes</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {q.gifts.map((g, i) => {
                    const key = `${q.quarter}-gift-${i}`;
                    return (
                      <div key={key} className="bg-secondary/50 border border-border rounded-xl p-2 flex flex-col items-center text-center">
                        {catalogPhotos[key] ? (
                          <div className="relative w-full">
                            <img src={catalogPhotos[key]} alt={g} className="w-full h-16 object-cover rounded-lg" />
                            <button onClick={() => removeCatalogPhoto(key)} disabled={uploadingKey === key} className="absolute -top-1 -right-1 bg-background border border-border rounded-full p-0.5 hover:text-destructive disabled:opacity-60">
                              {uploadingKey === key ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />}
                            </button>
                          </div>
                        ) : (
                          <label className="w-full h-16 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground hover:text-gold hover:border-gold/60 cursor-pointer transition">
                            {uploadingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                            <input type="file" accept="image/*" disabled={uploadingKey === key} className="hidden" onChange={(e) => onPickCatalogPhoto(key, e.target.files?.[0])} />
                          </label>
                        )}
                        <p className="text-[11px] font-semibold mt-1.5 leading-tight">{g}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Prêmio grande */}
              <div className="border-t border-gold/20 pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="h-3.5 w-3.5 text-gold" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gold">Prêmio Principal</span>
                </div>
                <div className="bg-gold/5 border border-gold/40 rounded-xl p-3 flex items-center gap-3">
                  {(() => {
                    const key = `${q.quarter}-grand`;
                    return catalogPhotos[key] ? (
                      <div className="relative flex-shrink-0">
                        <img src={catalogPhotos[key]} alt={q.grand} className="h-16 w-16 object-cover rounded-lg border border-gold/60" />
                        <button onClick={() => removeCatalogPhoto(key)} disabled={uploadingKey === key} className="absolute -top-1 -right-1 bg-background border border-border rounded-full p-0.5 hover:text-destructive disabled:opacity-60">
                          {uploadingKey === key ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />}
                        </button>
                      </div>
                    ) : (
                      <label className="h-16 w-16 flex-shrink-0 rounded-lg border-2 border-dashed border-gold/50 flex items-center justify-center text-gold hover:bg-gold/10 cursor-pointer transition">
                        {uploadingKey === key ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                        <input type="file" accept="image/*" disabled={uploadingKey === key} className="hidden" onChange={(e) => onPickCatalogPhoto(key, e.target.files?.[0])} />
                      </label>
                    );
                  })()}
                  <p className="text-sm font-bold text-foreground flex-1">{q.grand}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card><p className="text-sm text-muted-foreground italic">Nenhuma premiação nesta categoria ainda.</p></Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {filtered.map((a) => (
            <Card key={a.id} className={a.active ? "border-gold/40 overflow-hidden" : "overflow-hidden"}>
              {a.photo && (
                <img src={a.photo} alt={`Prêmio ${a.quarter}`} className="w-full h-40 object-cover rounded-xl mb-3 border border-border" />
              )}
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-gold/10"><CatIcon className="h-6 w-6 text-gold" /></div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <p className="text-xs text-gold font-bold uppercase tracking-wider">{a.quarter}</p>
                    <Badge className={a.active ? "bg-success/20 text-success border-success/40" : "bg-muted text-muted-foreground border-border"}>{a.active ? "Atual" : "Histórico"}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Avatar initials={initialsOf(a.winner)} photoUrl={getPhoto(a.winner)} size="sm" />
                    <p className="font-bold">{a.winner}</p>
                  </div>
                  {a.desc && <p className="text-xs text-muted-foreground mt-1">{a.desc}</p>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
