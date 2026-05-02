import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { pops } from "@/data/team";
import { FileText } from "lucide-react";

export default function Pops() {
  return (
    <div>
      <SectionTitle title="POPs Sir Alfred" subtitle="Procedimentos Operacionais Padrão" />
      <div className="grid lg:grid-cols-2 gap-4">
        {pops.map((p) => (
          <Card key={p.code}>
            <div className="flex items-start gap-3 mb-3">
              <div className="p-3 rounded-xl bg-gold/10 text-gold"><FileText className="h-5 w-5" /></div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs text-gold font-bold tracking-wider">{p.code}</p>
                  <Badge className={p.color}>{p.badge}</Badge>
                </div>
                <p className="font-bold text-lg mt-1">{p.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{p.desc}</p>
              </div>
            </div>
            <ol className="space-y-2 mt-4">
              {p.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="h-6 w-6 rounded-full bg-gold/20 text-gold font-bold flex items-center justify-center shrink-0 text-xs">{i + 1}</span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
    </div>
  );
}
