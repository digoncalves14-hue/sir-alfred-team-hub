import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { announcements } from "@/data/team";

export default function PAnnouncements() {
  return (
    <div>
      <SectionTitle title="Avisos" subtitle="Comunicados da gestão" />
      <div className="space-y-3">
        {announcements.map((a) => (
          <Card key={a.id}>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <Badge className={a.color}>{a.type}</Badge>
              <span className="text-xs text-muted-foreground">{a.unit} · {a.date}</span>
            </div>
            <p className="text-sm">{a.message}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
