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

type UnitRule = {
  id: string;
  unidade: "Birigui" | "Aracatuba" | "Penapolis";
  raio_metros: number;
  latitude: number | null;
  longitude: number | null;
};

type Profile = {
  id: string;
  nome: string;
  email: string;
  unidade: string | null;
  foto_url: string | null;
};

type UserRule = {
  user_id: string;
  horario_esperado: string;
  tolerancia_minutos: number;
};

const UNIT_LABEL: Record<UnitRule["unidade"], string> = {
  Birigui: "Birigui",
  Aracatuba: "Araçatuba",
  Penapolis: "Penápolis",
};

function UnitCard({ rule, onSaved }: { rule: UnitRule; onSaved: (r: UnitRule) => void }) {
  const [form, setForm] = useState(rule);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const update = (patch: Partial<UnitRule>) => setForm({ ...form, ...patch });

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
        raio_metros: Number(form.raio_metros),
        latitude: form.latitude,
        longitude: form.longitude,
      })
      .eq("id", form.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Local de ${UNIT_LABEL[form.unidade]} salvo`);
    onSaved(form);
  };

  return (
    <Card>
      <h4 className="font-semibold text-gold mb-3">{UNIT_LABEL[form.unidade]}</h4>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Raio permitido (m)</label>
          <Input
            type="number"
            min={10}
            value={form.raio_metros}
            onChange={(e) => update({ raio_metros: Number(e.target.value) })}
          />
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
            <span className="ml-2">Localização atual</span>
          </Button>
          <Button size="sm" onClick={save} disabled={saving} className="flex-1">
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ProfessionalRuleRow({
  profile,
  rule,
  onSaved,
}: {
  profile: Profile;
  rule: UserRule | undefined;
  onSaved: (r: UserRule) => void;
}) {
  const [horario, setHorario] = useState(rule?.horario_esperado.slice(0, 5) ?? "09:00");
  const [tolerancia, setTolerancia] = useState(rule?.tolerancia_minutos ?? 10);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("user_checkin_rules")
      .upsert(
        {
          user_id: profile.id,
          horario_esperado: horario,
          tolerancia_minutos: Number(tolerancia),
        },
        { onConflict: "user_id" }
      );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Horário de ${profile.nome} salvo`);
    onSaved({ user_id: profile.id, horario_esperado: horario, tolerancia_minutos: Number(tolerancia) });
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar initials={profile.nome.slice(0, 2).toUpperCase()} photoUrl={profile.foto_url ?? undefined} />
        <div className="flex-1 min-w-[140px]">
          <p className="font-semibold truncate">{profile.nome}</p>
          <p className="text-xs text-muted-foreground">{profile.unidade ?? "—"}</p>
        </div>
        <div className="w-28">
          <label className="text-xs text-muted-foreground">Horário</label>
          <Input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
        </div>
        <div className="w-24">
          <label className="text-xs text-muted-foreground">Tolerância</label>
          <Input
            type="number"
            min={0}
            value={tolerancia}
            onChange={(e) => setTolerancia(Number(e.target.value))}
          />
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "..." : "Salvar"}
        </Button>
      </div>
    </Card>
  );
}

export default function CheckIn() {
  const { getPhoto } = usePhotos();
  const [units, setUnits] = useState<UnitRule[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRules, setUserRules] = useState<Record<string, UserRule>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [u, p, r] = await Promise.all([
        supabase.from("checkin_rules").select("id,unidade,raio_metros,latitude,longitude").order("unidade"),
        supabase.from("profiles").select("id,nome,email,unidade,foto_url").order("nome"),
        supabase.from("user_checkin_rules").select("user_id,horario_esperado,tolerancia_minutos"),
      ]);
      if (u.error) toast.error(u.error.message);
      else setUnits((u.data ?? []) as UnitRule[]);
      if (p.error) toast.error(p.error.message);
      else setProfiles((p.data ?? []) as Profile[]);
      if (r.error) toast.error(r.error.message);
      else {
        const map: Record<string, UserRule> = {};
        (r.data ?? []).forEach((x: any) => (map[x.user_id] = x));
        setUserRules(map);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle title="Local das unidades" subtitle="Coordenadas e raio permitido para o check-in" />
        {loading ? (
          <p className="text-muted-foreground text-sm">Carregando...</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {units.map((r) => (
              <UnitCard key={r.id} rule={r} onSaved={(s) => setUnits((p) => p.map((x) => (x.id === s.id ? s : x)))} />
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionTitle title="Horário por profissional" subtitle="Defina o horário de entrada e tolerância de cada barbeiro" />
        {loading ? (
          <p className="text-muted-foreground text-sm">Carregando...</p>
        ) : profiles.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum profissional cadastrado ainda.</p>
        ) : (
          <div className="grid gap-3">
            {profiles.map((p) => (
              <ProfessionalRuleRow
                key={p.id}
                profile={p}
                rule={userRules[p.id]}
                onSaved={(r) => setUserRules((prev) => ({ ...prev, [p.id]: r }))}
              />
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
