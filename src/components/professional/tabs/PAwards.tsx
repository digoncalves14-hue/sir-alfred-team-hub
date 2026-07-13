import { useEffect, useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Gift, Trophy } from "lucide-react";
import AutoRankings from "@/components/awards/AutoRankings";

const CATALOG: { quarter: string; gifts: string[]; grand: string }[] = [
  { quarter: "1º Trimestre", gifts: ["Moletom", "Boné", "Camiseta"], grand: "Tesoura Tondeo" },
  { quarter: "2º Trimestre", gifts: ["Chinelo", "Mochila", "Necessaire"], grand: "Máquina Shaver WMark NG 7982" },
  { quarter: "3º Trimestre", gifts: ["Squeeze", "Nano Spray WMark", "Tapete Magnético"], grand: "Máquina Acabamento WMark NG 2033" },
  { quarter: "4º Trimestre", gifts: ["Porta Pente + Lâmina", "Navalha Austin", "Navalhete Desfiadeira"], grand: "Mini Soprador WMark TB 001" },
];

export default function PAwards() {
  const [catalogPhotos, setCatalogPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadCatalogPhotos = async () => {
      const { data } = await supabase
        .from("award_catalog_photos" as any)
        .select("item_key, photo_path");

      const entries = await Promise.all((data ?? []).map(async (row: any) => {
        if (!row.item_key || !row.photo_path) return;
        const { data: signed } = await supabase.storage
          .from("award-photos")
          .createSignedUrl(row.photo_path, 60 * 60 * 24 * 365);
        return signed?.signedUrl ? [row.item_key, signed.signedUrl] as const : undefined;
      }));

      const next: Record<string, string> = {};
      entries.forEach((entry) => {
        if (entry) next[entry[0]] = entry[1];
      });
      setCatalogPhotos(next);
    };

    loadCatalogPhotos();
  }, []);

  return (
    <div className="space-y-6">
      <SectionTitle title="Suas premiações" />

      <AutoRankings />

      <Card className="text-center border-gold/40">
        <Trophy className="h-12 w-12 text-gold mx-auto mb-2" />
        <p className="text-5xl font-black text-gold">0</p>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">Conquistadas</p>
      </Card>

      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
          <div className="flex items-center gap-2 text-gold">
            <Trophy className="h-5 w-5" />
            <h3 className="text-lg font-black uppercase tracking-widest">Catálogo de Prêmios</h3>
          </div>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
        </div>

        <Card className="border-2 border-gold shadow-gold overflow-hidden relative">
          <div className="absolute inset-0 gradient-gold opacity-5 pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row items-center gap-5">
            {catalogPhotos.annual ? (
              <img src={catalogPhotos.annual} alt="Combo VGR V 640 S4" className="h-32 w-32 sm:h-40 sm:w-40 rounded-2xl object-cover border-2 border-gold" />
            ) : (
              <div className="h-32 w-32 sm:h-40 sm:w-40 rounded-2xl border-2 border-dashed border-gold/50 flex items-center justify-center text-gold">
                <Gift className="h-10 w-10" />
              </div>
            )}
            <div className="flex-1 text-center sm:text-left">
              <Badge className="bg-gold/20 text-gold border-gold/60 mb-2">🏆 Prêmio Anual</Badge>
              <h4 className="text-2xl sm:text-3xl font-black text-gold">Combo VGR V 640 S4 4 em 1</h4>
              <p className="text-sm text-muted-foreground mt-2">Corte, acabamento, shaver e secador — o destaque máximo da temporada.</p>
            </div>
          </div>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          {CATALOG.map((q) => (
            <Card key={q.quarter} className="border-gold/30">
              <div className="flex items-center gap-2 mb-4">
                <Crown className="h-4 w-4 text-gold" />
                <h4 className="font-black uppercase tracking-widest text-gold text-sm">{q.quarter}</h4>
              </div>

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
                          <img src={catalogPhotos[key]} alt={g} className="w-full h-16 object-cover rounded-lg" />
                        ) : (
                          <div className="w-full h-16 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground">
                            <Gift className="h-4 w-4" />
                          </div>
                        )}
                        <p className="text-[11px] font-semibold mt-1.5 leading-tight">{g}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-gold/20 pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="h-3.5 w-3.5 text-gold" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gold">Prêmio Principal</span>
                </div>
                <div className="bg-gold/5 border border-gold/40 rounded-xl p-3 flex items-center gap-3">
                  {catalogPhotos[`${q.quarter}-grand`] ? (
                    <img src={catalogPhotos[`${q.quarter}-grand`]} alt={q.grand} className="h-16 w-16 object-cover rounded-lg border border-gold/60" />
                  ) : (
                    <div className="h-16 w-16 rounded-lg border-2 border-dashed border-gold/50 flex items-center justify-center text-gold">
                      <Trophy className="h-5 w-5" />
                    </div>
                  )}
                  <p className="text-sm font-bold text-foreground flex-1">{q.grand}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}