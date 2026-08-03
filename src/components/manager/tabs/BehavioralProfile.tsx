import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { Brain, ExternalLink, Save, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Profile = { id: string; nome: string; cargo: string | null; unidade: string | null };
type BP = {
  id?: string;
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

export default function BehavioralProfile() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [bps, setBps] = useState<Record<string, BP>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BP | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: b }] = await Promise.all([
      supabase.from("profiles").select("id, nome, cargo, unidade").order("nome"),
      supabase.from("behavioral_profiles").select("*"),
    ]);
    setProfiles((p ?? []) as Profile[]);
    const map: Record<string, BP> = {};
    (b ?? []).forEach((row: any) => (map[row.professional_id] = row));
    setBps(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("behavioral-manager")
      .on("postgres_changes", { event: "*", schema: "public", table: "behavioral_profiles" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);


  const startEdit = (pid: string) => {
    setEditingId(pid);
    setDraft(bps[pid] ? { ...bps[pid] } : empty(pid));
  };

  const save = async () => {
    if (!draft) return;
    const payload = {
      professional_id: draft.professional_id,
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
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Perfil comportamental salvo" });
    setEditingId(null);
    setDraft(null);
    load();
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Perfil Comportamental"
        subtitle="Registre o resultado do teste de cada profissional (visível apenas para gestores)"
      />

      <div className="rounded-2xl border border-gold/30 bg-gold/5 p-4 space-y-3">
        <div className="flex items-center gap-2 text-gold">
          <Brain className="h-4 w-4" />
          <p className="text-sm font-semibold">Testes recomendados</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Envie um desses links para o profissional preencher. Depois, cole o link do resultado ou registre o perfil dele no card abaixo.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="https://www.16personalities.com/br"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary border border-border text-sm font-medium hover:border-gold/50 transition-all"
          >
            <ExternalLink className="h-3.5 w-3.5 text-gold" />
            16personalidades (MBTI)
          </a>
          <a
            href="https://www.mydiscprofile.com/pt-pt/free-personality-test.php"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary border border-border text-sm font-medium hover:border-gold/50 transition-all"
          >
            <ExternalLink className="h-3.5 w-3.5 text-gold" />
            Teste DISC grátis
          </a>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <div className="grid lg:grid-cols-2 gap-4">
        {profiles.map((p) => {
          const bp = bps[p.id];
          const isEditing = editingId === p.id;
          return (
            <Card key={p.id} className="hover:border-gold/50 transition-all">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="font-bold text-foreground truncate">{p.nome}</p>
                  {p.cargo && (
                    <p className="text-xs text-gold uppercase tracking-wider mt-0.5">{p.cargo}</p>
                  )}
                  {p.unidade && <p className="text-xs text-muted-foreground">{p.unidade}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Brain className="h-4 w-4 text-gold" />
                  {bp?.perfil && (
                    <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-gold/10 text-gold border border-gold/30">
                      {bp.perfil}
                    </span>
                  )}
                </div>
              </div>

              {!isEditing && (
                <>
                  {bp ? (
                    <div className="space-y-2 text-sm">
                      {bp.data_teste && (
                        <p className="text-xs text-muted-foreground">
                          Teste em {new Date(bp.data_teste).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                      {bp.link && (
                        <a
                          href={bp.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-gold hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" /> Ver resultado
                        </a>
                      )}
                      {bp.pontos_fortes && (
                        <p><span className="font-semibold">Pontos fortes:</span> {bp.pontos_fortes}</p>
                      )}
                      {bp.pontos_atencao && (
                        <p><span className="font-semibold">Pontos de atenção:</span> {bp.pontos_atencao}</p>
                      )}
                      {bp.observacoes && (
                        <p className="text-muted-foreground italic">{bp.observacoes}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Nenhum teste registrado.</p>
                  )}
                  <button
                    onClick={() => startEdit(p.id)}
                    className="mt-4 px-4 py-2 rounded-xl gradient-gold text-background font-bold text-xs shadow-gold hover:scale-[1.02] transition-all"
                  >
                    {bp ? "Editar" : "Registrar teste"}
                  </button>
                </>
              )}

              {isEditing && draft && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder="Perfil (ex: Dominante)"
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
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl gradient-gold text-background font-bold text-xs shadow-gold"
                    >
                      <Save className="h-3 w-3" /> Salvar
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setDraft(null); }}
                      className="px-4 py-2 rounded-xl bg-secondary text-foreground font-bold text-xs"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {!loading && profiles.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum profissional cadastrado ainda.</p>
      )}
    </div>
  );
}
