import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { Avatar } from "@/components/Avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { team } from "@/data/team";
import { usePhotos } from "@/hooks/usePhotos";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MapPin, Loader2 } from "lucide-react";

const dot = { present: "bg-success", late: "bg-warning", absent: "bg-destructive", pending: "bg-muted-foreground" };
const label = { present: "Presente", late: "Atrasado", absent: "Falta", pending: "Pendente" };

type Rule = {
  id: string;
  unidade: "Birigui" | "Aracatuba" | "Penapolis";
  horario_esperado: string;
  tolerancia_minutos: number;
  raio_metros: number;
  latitude: number | null;
  longitude: number | null;
};

const UNIT_LABEL: Record<Rule["unidade"], string> = {
  Birigui: "Birigui",
  Aracatuba: "Araçatuba",
  Penapolis: "Penápolis",
};

function RuleCard({ rule, onSaved }: { rule: Rule; onSaved: (r: Rule) => void }) {
  const [form, setForm] = useState(rule);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const update = (patch: Partial<Rule>) => setForm({ ...form, ...patch });

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return toast.error("Geolocalização indisponível");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setLocating(false);
        toast.success("Coordenadas capturadas");
      },
      () => {
        setLocating(false);
        toast.error("Não foi possível obter a localização");
      }
    );
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("checkin_rules")
      .update({
        horario_esperado: form.horario_esperado,
        tolerancia_minutos: Number(form.tolerancia_minutos),
        raio_metros: Number(form.raio_metros),
        latitude: form.latitude,
        longitude: form.longitude,
      })
      .eq("id", form.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Regras de ${UNIT_LABEL[form.unidade]} salvas`);
    onSaved(form);
  };

  return (
    <Card>
      <h4 className="font-semibold text-gold mb-3">{UNIT_LABEL[form.unidade]}</h4>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Horário esperado</label>
          <Input
            type="time"
            value={form.horario_esperado.slice(0, 5)}
            onChange={(e) => update({ horario_esperado: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Tolerância (min)</label>
            <Input
              type="number"
              min={0}
              value={form.tolerancia_minutos}
              onChange={(e) => update({ tolerancia_minutos: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Raio (m)</label>
            <Input
              type="number"
              min={10}
              value={form.raio_metros}
              onChange={(e) => update({ raio_metros: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Latitude</label>
            <Input
              type="number"
              step="any"
              value={form.latitude ?? ""}
              onChange={(e) => update({ latitude: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Longitude</label>
            <Input
              type="number"
              step="any"
              value={form.longitude ?? ""}
              onChange={(e) => update({ longitude: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={useCurrentLocation} disabled={locating} className="flex-1">
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            <span className="ml-2">Usar localização atual</span>
          </Button>
          <Button size="sm" onClick={save} disabled={saving} className="flex-1">
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function CheckIn() {
  const { getPhoto } = usePhotos();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("checkin_rules")
        .select("*")
        .order("unidade");
      if (error) toast.error(error.message);
      else setRules((data ?? []) as Rule[]);
      setLoading(false);
    })();
  }, []);

  const onSaved = (r: Rule) =>
    setRules((prev) => prev.map((x) => (x.id === r.id ? r : x)));

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle title="Regras de Check-in" subtitle="Horário, tolerância e raio por unidade" />
        {loading ? (
          <p className="text-muted-foreground text-sm">Carregando regras...</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rules.map((r) => (
              <RuleCard key={r.id} rule={r} onSaved={onSaved} />
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionTitle title="Check-in ao vivo" subtitle="Status em tempo real da equipe" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {team.map((p) => (
            <Card key={p.id}>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar initials={p.initials} photoUrl={getPhoto(p.name)} />
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
    </div>
  );
}
