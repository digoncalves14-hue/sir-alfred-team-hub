import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { Brain, ExternalLink, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

type BP = {
  professional_id: string;
  perfil: string | null;
  link: string | null;
  pontos_fortes: string | null;
  pontos_atencao: string | null;
  observacoes: string | null;
  data_teste: string | null;
};

const empty = (pid: string): BP => ({
  professional_id: pid,
  perfil: "",
  link: "",
  pontos_fortes: "",
  pontos_atencao: "",
  observacoes: "",
  data_teste: "",
});

export default function PBehavioral() {
  const { user } = useAuth();
  const [bp, setBp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<BP | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("behavioral_profiles")
      .select("*")
      .eq("professional_id", user.id)
      .maybeSingle();
    setBp(data);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    load();

    const channel = supabase
      .channel("behavioral-self")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "behavioral_profiles", filter: `professional_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const save = async () => {
    if (!draft || !user) return;
    setSaving(true);
    const payload = {
      professional_id: user.id,
      perfil: draft.perfil || null,
      link: draft.link || null,
      pontos_fortes: draft.pontos_fortes || null,
      pontos_atencao: draft.pontos_atencao || null,
      observacoes: draft.observacoes || null,
      data_teste: draft.data_teste || null,
    };
    const { error } = await supabase
      .from("behavioral_profiles")
      .upsert(payload, { onConflict: "professional_id" });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Perfil comportamental registrado", description: "Seu gestor já consegue ver o resultado." });
    setDraft(null);
    load();
  };

  return (
    <div className="space-y-6">
      <SectionTitle title="Meu Perfil Comportamental" subtitle="Registre e acompanhe o resultado do seu teste" />

      <div className="rounded-2xl border border-gold/30 bg-gold/5 p-4 space-y-3">
        <div className="flex items-center gap-2 text-gold">
          <Brain className="h-4 w-4" />
          <p className="text-sm font-semibold">Faça seu teste</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Escolha um dos testes abaixo, faça o teste e depois registre o resultado aqui. Ele fica visível para você e para a gestão.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="https://www.16personalities.com/br" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary border border-border text-sm font-medium hover:border-gold/50 transition-all">
            <ExternalLink className="h-3.5 w-3.5 text-gold" /> 16personalidades (MBTI)
          </a>
          <a href="https://www.mydiscprofile.com/pt-pt/free-personality-test.php" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary border border-border text-sm font-medium hover:border-gold/50 transition-all">
            <ExternalLink className="h-3.5 w-3.5 text-gold" /> Teste DISC grátis
          </a>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : draft ? (
        <Card>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Perfil (ex: Dominante / INFJ)"
                value={draft.perfil ?? ""}
                onChange={(e) => setDraft({ ...draft, perfil: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
              />
              <input
                type="date"
                value={draft.data_teste ?? ""}
                onChange={(e) => setDraft({ ...draft, data_teste: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
              />
            </div>
            <input
              placeholder="Link do resultado do teste"
              value={draft.link ?? ""}
              onChange={(e) => setDraft({ ...draft, link: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
            />
            <textarea
              placeholder="Pontos fortes"
              value={draft.pontos_fortes ?? ""}
              onChange={(e) => setDraft({ ...draft, pontos_fortes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm resize-none"
            />
            <textarea
              placeholder="Pontos de atenção"
              value={draft.pontos_atencao ?? ""}
              onChange={(e) => setDraft({ ...draft, pontos_atencao: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm resize-none"
            />
            <textarea
              placeholder="Observações"
              value={draft.observacoes ?? ""}
              onChange={(e) => setDraft({ ...draft, observacoes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl gradient-gold text-background font-bold text-xs shadow-gold disabled:opacity-60"
              >
                <Save className="h-3 w-3" /> {saving ? "Salvando…" : "Salvar"}
              </button>
              <button
                onClick={() => setDraft(null)}
                className="px-4 py-2 rounded-xl bg-secondary border border-border text-xs font-medium inline-flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Cancelar
              </button>
            </div>
          </div>
        </Card>
      ) : bp ? (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Brain className="h-4 w-4 text-gold" />
            {bp.perfil && (
              <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-gold/10 text-gold border border-gold/30">
                {bp.perfil}
              </span>
            )}
            {bp.data_teste && (
              <span className="text-xs text-muted-foreground">
                Teste em {new Date(bp.data_teste).toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
          <div className="space-y-2 text-sm">
            {bp.link && (
              <a href={bp.link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-gold hover:underline">
                <ExternalLink className="h-3 w-3" /> Ver resultado
              </a>
            )}
            {bp.pontos_fortes && <p><span className="font-semibold">Pontos fortes:</span> {bp.pontos_fortes}</p>}
            {bp.pontos_atencao && <p><span className="font-semibold">Pontos de atenção:</span> {bp.pontos_atencao}</p>}
            {bp.observacoes && <p className="text-muted-foreground italic">{bp.observacoes}</p>}
          </div>
          <button
            onClick={() => setDraft({ ...empty(bp.professional_id), ...bp })}
            className="mt-4 px-4 py-2 rounded-xl gradient-gold text-background font-bold text-xs shadow-gold hover:scale-[1.02] transition-all"
          >
            Editar meu resultado
          </button>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-muted-foreground italic">
            Nenhum teste registrado ainda. Faça um dos testes acima e registre o resultado aqui.
          </p>
          <button
            onClick={() => user && setDraft(empty(user.id))}
            className="mt-4 px-4 py-2 rounded-xl gradient-gold text-background font-bold text-xs shadow-gold hover:scale-[1.02] transition-all"
          >
            Registrar meu resultado
          </button>
        </Card>
      )}
    </div>
  );
}
