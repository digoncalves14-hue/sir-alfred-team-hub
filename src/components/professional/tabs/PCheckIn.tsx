import { useEffect, useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { MapPin, Clock, Camera, CheckCircle2, Loader2 } from "lucide-react";

type Step = 1 | 2 | 3 | 4;

const recent = [
  { day: "Ontem", time: "08:03", status: "Pontual" },
  { day: "Anteontem", time: "08:18", status: "Atraso" },
  { day: "Sex", time: "07:55", status: "Pontual" },
  { day: "Qui", time: "08:00", status: "Pontual" },
];

export default function PCheckIn() {
  const [step, setStep] = useState<Step>(1);
  const [now, setNow] = useState(new Date());
  const [locStatus, setLocStatus] = useState<"idle" | "loading" | "ok">("idle");
  const [selfie, setSelfie] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const verifyLoc = () => {
    setLocStatus("loading");
    setTimeout(() => { setLocStatus("ok"); setTimeout(() => setStep(2), 800); }, 1500);
  };

  if (step === 4) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Card className="text-center border-success/40 bg-success/5">
          <div className="inline-flex p-5 rounded-full bg-success/20 mb-4 animate-scale-in">
            <CheckCircle2 className="h-14 w-14 text-success" />
          </div>
          <p className="text-2xl font-black">Check-in confirmado!</p>
          <p className="text-muted-foreground mt-2">Thiago · Birigui</p>
          <p className="text-3xl font-black text-gold my-3">{now.toLocaleTimeString("pt-BR")}</p>
          <div className="flex gap-2 justify-center flex-wrap mt-4">
            <Badge className="bg-success/20 text-success border-success/40">Localização ✓</Badge>
            <Badge className="bg-success/20 text-success border-success/40">IA Confirmada ✓</Badge>
            <Badge className="bg-gold/20 text-gold border-gold/40">Pontual</Badge>
          </div>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-widest text-gold font-bold mb-4">Histórico recente</p>
          <div className="space-y-2">
            {recent.map((r, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl">
                <p className="text-sm font-semibold">{r.day}</p>
                <p className="text-sm text-gold font-bold">{r.time}</p>
                <Badge className={r.status === "Pontual" ? "bg-success/20 text-success border-success/40" : "bg-warning/20 text-warning border-warning/40"}>{r.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
        <button onClick={() => { setStep(1); setLocStatus("idle"); setSelfie(false); }} className="w-full bg-card border border-border rounded-xl py-3 text-sm text-muted-foreground hover:text-gold transition">Reiniciar</button>
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

      {step === 1 && (
        <Card className="text-center animate-fade-in">
          <p className="text-xs uppercase tracking-widest text-gold font-bold mb-6">Localização</p>
          <div className="relative inline-flex items-center justify-center mb-6">
            <span className="absolute inset-0 rounded-full bg-gold/30 animate-ping-slow" />
            <div className="relative p-6 rounded-full bg-gold/10 border-2 border-gold">
              <MapPin className="h-12 w-12 text-gold" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-6">Estamos verificando se você está dentro da unidade</p>
          {locStatus === "ok" ? (
            <p className="text-success font-bold animate-fade-in">✓ Você está na unidade!</p>
          ) : (
            <button onClick={verifyLoc} disabled={locStatus === "loading"} className="gradient-gold text-background font-bold px-6 py-3 rounded-xl inline-flex items-center gap-2 hover:scale-105 transition disabled:opacity-50">
              {locStatus === "loading" && <Loader2 className="h-4 w-4 animate-spin" />} Verificar localização
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
            <div className="flex justify-between"><span className="text-muted-foreground">Horário de entrada</span><span className="font-bold">08:00</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tolerância</span><span className="font-bold">15 min</span></div>
          </div>
          <p className="text-success font-bold mt-4">✓ Dentro da janela permitida</p>
          <button onClick={() => setStep(3)} className="mt-6 gradient-gold text-background font-bold px-6 py-3 rounded-xl hover:scale-105 transition">Confirmar horário</button>
        </Card>
      )}

      {step === 3 && (
        <Card className="text-center animate-fade-in">
          <p className="text-xs uppercase tracking-widest text-gold font-bold mb-6">Selfie</p>
          <div className="relative aspect-square max-w-xs mx-auto rounded-2xl bg-black border-2 border-dashed border-border flex items-center justify-center mb-6 overflow-hidden">
            {selfie ? (
              <div className="text-center text-success animate-scale-in">
                <CheckCircle2 className="h-16 w-16 mx-auto" />
                <p className="font-bold mt-2">Selfie capturada</p>
              </div>
            ) : (
              <Camera className="h-16 w-16 text-muted-foreground" />
            )}
          </div>
          {!selfie ? (
            <button onClick={() => setSelfie(true)} className="gradient-gold text-background font-bold px-6 py-3 rounded-xl inline-flex items-center gap-2 hover:scale-105 transition">
              <Camera className="h-4 w-4" /> Abrir câmera e tirar selfie
            </button>
          ) : (
            <button onClick={() => setStep(4)} className="bg-success text-white font-bold px-6 py-3 rounded-xl hover:scale-105 transition">Confirmar check-in</button>
          )}
        </Card>
      )}
    </div>
  );
}
