import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { Avatar } from "@/components/Avatar";
import { team } from "@/data/team";

const dot = { present: "bg-success", late: "bg-warning", absent: "bg-destructive", pending: "bg-muted-foreground" };
const label = { present: "Presente", late: "Atrasado", absent: "Falta", pending: "Pendente" };

export default function CheckIn() {
  return (
    <div>
      <SectionTitle title="Check-in ao vivo" subtitle="Status em tempo real da equipe" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {team.map((p) => (
          <Card key={p.id}>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Avatar initials={p.initials} />
                <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${dot[p.checkIn.status]}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.unit}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{label[p.checkIn.status]}</p>
                <p className="text-sm font-bold text-gold">{p.checkIn.time}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
