import { useEffect, useRef, useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { MapPin, Clock, Camera, CheckCircle2, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

type Step = 1 | 2 | 3 | 4;
type Unidade = "birigui" | "aracatuba" | "penapolis" | "kids";

const UNIDADE_COORDS: Record<Unidade, { lat: number; lng: number; label: string }> = {
  birigui:    { lat: -21.2886, lng: -50.3406, label: "Birigui" },
  aracatuba:  { lat: -21.2090, lng: -50.4429, label: "Araçatuba" },
  penapolis:  { lat: -21.4194, lng: -50.0778, label: "Penápolis" },
  kids:       { lat: -21.2886, lng: -50.3406, label: "Kids (Birigui)" },
};

const RAIO_METROS = 150;

// Haversine distance in meters
function distMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

type TimeStatus = "pontual" | "atraso_tolerancia" | "atraso" | "fora_janela";
function evalTime(d: Date): TimeStatus {
  const m = d.getHours() * 60 + d.getMinutes();
  const start = 8 * 60;        // 08:00
  const onTimeEnd = 9 * 60;    // 09:00
  const tolEnd = 9 * 60 + 15;  // 09:15
  if (m < start || m > tolEnd) return "fora_janela";
  if (m <= onTimeEnd) return "pontual";
  return "atraso_tolerancia";
}

export default function PCheckIn() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<{ nome: string; unidade: Unidade | null } | null>(null);

  const [step, setStep] = useState<Step>(1);
  const [now, setNow] = useState(new Date());

  // step 1
  const [locStatus, setLocStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [locError, setLocError] = useState<string>("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  // step 3
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // result
  const [finalStatus, setFinalStatus] = useState<TimeStatus>("pontual");
  const [finalTime, setFinalTime] = useState<Date | null>(null);

  // recent history
  const [recent, setRecent] = useState<{ created_at: string; status: string }[]>([]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("nome, unidade").eq("id", user.id).maybeSingle()
      .then(({ data }) => setProfile(data as any));
    loadRecent();
  }, [user]);

  const loadRecent = async () => {
    if (!user) return;
    const { data } = await supabase.from("check_ins")
      .select("created_at, status").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(5);
    setRecent(data ?? []);
  };

  const unidade: Unidade | null = profile?.unidade ?? null;
  const target = unidade ? UNIDADE_COORDS[unidade] : null;

  const verifyLoc = () => {
    if (!target) {
      setLocStatus("error");
      setLocError("Sua unidade não está cadastrada no perfil.");
      return;
    }
    if (!navigator.geolocation) {
      setLocStatus("error");
      setLocError("Geolocalização não suportada neste dispositivo.");
      return;
    }
    setLocStatus("loading");
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        const d = distMeters(latitude, longitude, target.lat, target.lng);
        setDistance(d);
        if (d <= RAIO_METROS) {
          setLocStatus("ok");
          setTimeout(() => setStep(2), 800);
        } else {
          setLocStatus("error");
          setLocError(`Você está a ${Math.round(d)} m da unidade ${target.label}. Aproxime-se (raio permitido: ${RAIO_METROS} m).`);
        }
      },
      (err) => {
        setLocStatus("error");
        setLocError(err.code === 1 ? "Permissão de localização negada." : "Não foi possível obter sua localização.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  useEffect(() => () => stopCamera(), []);

  const startCamera = async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" }, audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (e: any) {
      setCameraError(e?.message || "Não foi possível acessar a câmera.");
    }
  };

  const takeSelfie = () => {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // mirror selfie
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setSelfieDataUrl(dataUrl);
    stopCamera();
  };

  const dataUrlToBlob = (dataUrl: string) => {
    const [meta, b64] = dataUrl.split(",");
    const mime = meta.match(/data:(.*?);/)?.[1] || "image/jpeg";
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };

  const confirmCheckIn = async () => {
    if (!user || !unidade || !selfieDataUrl) return;
    const ts = evalTime(now);
    if (ts === "fora_janela") {
      toast({ title: "Fora da janela permitida", description: "Check-in disponível das 08:00 às 09:15.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const blob = dataUrlToBlob(selfieDataUrl);
      const path = `${user.id}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("checkin-selfies")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("checkin-selfies").getPublicUrl(path);
      const { error: insErr } = await supabase.from("check_ins").insert({
        user_id: user.id,
        unidade: unidade as any,
        status: ts,
        latitude: coords?.lat,
        longitude: coords?.lng,
        selfie_url: pub.publicUrl,
      });
      if (insErr) throw insErr;
      setFinalStatus(ts);
      setFinalTime(new Date());
      setStep(4);
      loadRecent();
    } catch (e: any) {
      toast({ title: "Erro ao registrar check-in", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep(1); setLocStatus("idle"); setLocError(""); setCoords(null); setDistance(null);
    setSelfieDataUrl(null); setCameraError("");
  };

  const timeStatus = evalTime(now);
  const statusLabel = (s: string) =>
    s === "pontual" ? "Pontual" : s === "atraso_tolerancia" ? "Atraso (tolerância)" : "Atraso";
  const statusBadge = (s: string) =>
    s === "pontual" ? "bg-success/20 text-success border-success/40"
    : s === "atraso_tolerancia" ? "bg-warning/20 text-warning border-warning/40"
    : "bg-destructive/20 text-destructive border-destructive/40";

  if (step === 4) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Card className="text-center border-success/40 bg-success/5">
          <div className="inline-flex p-5 rounded-full bg-success/20 mb-4 animate-scale-in">
            <CheckCircle2 className="h-14 w-14 text-success" />
          </div>
          <p className="text-2xl font-black">Check-in confirmado!</p>
          <p className="text-muted-foreground mt-2">{profile?.nome} · {target?.label}</p>
          <p className="text-3xl font-black text-gold my-3">{finalTime?.toLocaleTimeString("pt-BR")}</p>
          <div className="flex gap-2 justify-center flex-wrap mt-4">
            <Badge className="bg-success/20 text-success border-success/40">Localização ✓</Badge>
            <Badge className="bg-success/20 text-success border-success/40">Câmera ✓</Badge>
            <Badge className="bg-success/20 text-success border-success/40">Horário ✓</Badge>
            <Badge className={statusBadge(finalStatus)}>{statusLabel(finalStatus)}</Badge>
          </div>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-widest text-gold font-bold mb-4">Histórico recente</p>
          <div className="space-y-2">
            {recent.length === 0 && <p className="text-sm text-muted-foreground">Sem registros ainda.</p>}
            {recent.map((r, i) => {
              const d = new Date(r.created_at);
              return (
                <div key={i} className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl">
                  <p className="text-sm font-semibold">{d.toLocaleDateString("pt-BR")}</p>
                  <p className="text-sm text-gold font-bold">{d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                  <Badge className={statusBadge(r.status)}>{statusLabel(r.status)}</Badge>
                </div>
              );
            })}
          </div>
        </Card>
        <button onClick={reset} className="w-full bg-card border border-border rounded-xl py-3 text-sm text-muted-foreground hover:text-gold transition">
          Novo check-in
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionTitle title="Check-in" subtitle={`Etapa ${step} de 3`} />
      <div className="flex gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`flex-1 h-1.5 rounded-full ${s <= step ? "bg-gold" : "bg-secondary"}`} />
        ))}
      </div>

      {!unidade && (
        <Card className="border-destructive/40 bg-destructive/5">
          <div className="flex gap-3 items-start">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm">Sua unidade não está definida no perfil. Peça ao gestor para configurar.</p>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card className="text-center animate-fade-in">
          <p className="text-xs uppercase tracking-widest text-gold font-bold mb-6">Localização — {target?.label ?? "—"}</p>
          <div className="relative inline-flex items-center justify-center mb-6">
            <span className="absolute inset-0 rounded-full bg-gold/30 animate-ping-slow" />
            <div className="relative p-6 rounded-full bg-gold/10 border-2 border-gold">
              <MapPin className="h-12 w-12 text-gold" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-6">Verificando se você está dentro do raio de {RAIO_METROS} m da unidade</p>

          {locStatus === "ok" && (
            <p className="text-success font-bold animate-fade-in">✓ Você está na unidade ({Math.round(distance ?? 0)} m)</p>
          )}
          {locStatus === "error" && (
            <div className="bg-destructive/10 border border-destructive/40 rounded-xl p-4 mb-4 text-left">
              <p className="text-destructive font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Bloqueado</p>
              <p className="text-sm text-destructive/90 mt-1">{locError}</p>
            </div>
          )}
          {locStatus !== "ok" && (
            <button
              onClick={verifyLoc}
              disabled={locStatus === "loading" || !unidade}
              className="gradient-gold text-background font-bold px-6 py-3 rounded-xl inline-flex items-center gap-2 hover:scale-105 transition disabled:opacity-50"
            >
              {locStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {locStatus === "error" ? "Tentar novamente" : "Verificar localização"}
            </button>
          )}
        </Card>
      )}

      {step === 2 && (
        <Card className="text-center animate-fade-in">
          <p className="text-xs uppercase tracking-widest text-gold font-bold mb-6">Horário</p>
          <Clock className="h-10 w-10 text-gold mx-auto mb-3" />
          <p className="text-5xl font-black text-foreground tabular-nums">{now.toLocaleTimeString("pt-BR")}</p>
          <div className="mt-6 bg-secondary/50 rounded-xl p-4 text-left text-sm space-y-2">
            <div className="flex justify-between"><span className="text-muted-foreground">Janela permitida</span><span className="font-bold">08:00 — 09:15</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Pontual até</span><span className="font-bold">09:00</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tolerância até</span><span className="font-bold">09:15</span></div>
          </div>
          {timeStatus === "pontual" && <p className="text-success font-bold mt-4">✓ Pontual</p>}
          {timeStatus === "atraso_tolerancia" && <p className="text-warning font-bold mt-4">⚠ Atraso dentro da tolerância</p>}
          {timeStatus === "fora_janela" && <p className="text-destructive font-bold mt-4">✗ Fora da janela permitida (08:00 — 09:15)</p>}
          <button
            onClick={() => setStep(3)}
            disabled={timeStatus === "fora_janela"}
            className="mt-6 gradient-gold text-background font-bold px-6 py-3 rounded-xl hover:scale-105 transition disabled:opacity-50 disabled:hover:scale-100"
          >
            Confirmar horário
          </button>
        </Card>
      )}

      {step === 3 && (
        <Card className="text-center animate-fade-in">
          <p className="text-xs uppercase tracking-widest text-gold font-bold mb-6">Selfie</p>
          <div className="relative aspect-square max-w-xs mx-auto rounded-2xl bg-black border-2 border-dashed border-border flex items-center justify-center mb-6 overflow-hidden">
            {selfieDataUrl ? (
              <img src={selfieDataUrl} alt="Selfie" className="w-full h-full object-cover" />
            ) : cameraOn ? (
              <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" playsInline muted />
            ) : (
              <Camera className="h-16 w-16 text-muted-foreground" />
            )}
          </div>

          {cameraError && (
            <p className="text-destructive text-sm mb-3">{cameraError}</p>
          )}

          {!cameraOn && !selfieDataUrl && (
            <button onClick={startCamera} className="gradient-gold text-background font-bold px-6 py-3 rounded-xl inline-flex items-center gap-2 hover:scale-105 transition">
              <Camera className="h-4 w-4" /> Abrir câmera
            </button>
          )}
          {cameraOn && !selfieDataUrl && (
            <button onClick={takeSelfie} className="gradient-gold text-background font-bold px-6 py-3 rounded-xl inline-flex items-center gap-2 hover:scale-105 transition">
              <Camera className="h-4 w-4" /> Tirar foto
            </button>
          )}
          {selfieDataUrl && (
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => { setSelfieDataUrl(null); startCamera(); }}
                className="bg-card border border-border text-foreground font-bold px-5 py-3 rounded-xl hover:text-gold transition"
              >
                Refazer
              </button>
              <button
                onClick={confirmCheckIn}
                disabled={submitting}
                className="bg-success text-white font-bold px-6 py-3 rounded-xl hover:scale-105 transition inline-flex items-center gap-2 disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar check-in
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
