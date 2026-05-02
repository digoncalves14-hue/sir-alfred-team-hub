import { Card, SectionTitle } from "@/components/ui-kit";
import { Avatar } from "@/components/Avatar";
import { team } from "@/data/team";

export default function Team() {
  return (
    <div>
      <SectionTitle title="Equipe" subtitle="10 profissionais em 3 unidades" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {team.map((p) => (
          <Card key={p.id} className="hover:border-gold/50 hover:scale-[1.02] transition-all cursor-pointer">
            <div className="flex items-center gap-4">
              <Avatar initials={p.initials} size="lg" />
              <div className="min-w-0">
                <p className="font-bold text-foreground truncate">{p.name}</p>
                <p className="text-xs text-gold uppercase tracking-wider mt-0.5">{p.role}</p>
                <p className="text-xs text-muted-foreground mt-1">{p.unit}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
