import { Card, SectionTitle } from "@/components/ui-kit";

export default function PGoals() {
  return (
    <div className="space-y-6">
      <SectionTitle
        title="Meu Desempenho"
        subtitle="Acompanhamento voluntário da sua performance como profissional-parceiro"
      />
      <Card>
        <p className="text-xs uppercase tracking-widest text-gold mb-2">Referências de mercado</p>
        <p className="text-sm text-muted-foreground">
          Este espaço reúne referências de performance para você acompanhar sua evolução como
          profissional-parceiro autônomo. Não há metas obrigatórias, cobrança de resultado, controle
          de jornada ou penalidade por não atingimento — os números aqui servem apenas para
          autogestão e planejamento do seu próprio negócio.
        </p>
      </Card>
      <Card>
        <p className="text-sm text-muted-foreground italic">
          Nenhuma referência publicada no momento.
        </p>
      </Card>
    </div>
  );
}
