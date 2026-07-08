import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { Brain, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export default function PBehavioral() {
  const { user } = useAuth();
  const [bp, setBp] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("behavioral_profiles")
      .select("*")
      .eq("professional_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setBp(data);
        setLoading(false);
      });
  }, [user]);

  return (
    <div className="space-y-6">
      <SectionTitle title="Meu Perfil Comportamental" subtitle="Resultado do seu teste" />

      <div className="rounded-2xl border border-gold/30 bg-gold/5 p-4 space-y-3">
        <div className="flex items-center gap-2 text-gold">
          <Brain className="h-4 w-4" />
          <p className="text-sm font-semibold">Faça seu teste</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Se ainda não fez, escolha um dos testes abaixo e envie o resultado para o seu gestor.
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
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-muted-foreground italic">
            Nenhum teste registrado ainda. Faça um dos testes acima e envie o link do resultado para seu gestor.
          </p>
        </Card>
      )}
    </div>
  );
}
