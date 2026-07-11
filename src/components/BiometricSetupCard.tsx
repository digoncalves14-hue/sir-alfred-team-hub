import { Fingerprint, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { biometric } from "@/hooks/useBiometric";
import { toast } from "sonner";
import { useState } from "react";

interface Props {
  userId: string;
  userLabel: string;
  onDone: () => void;
}

const BiometricSetupCard = ({ userId, userLabel, onDone }: Props) => {
  const [busy, setBusy] = useState(false);

  const activate = async () => {
    setBusy(true);
    try {
      await biometric.register(userId, userLabel);
      toast.success("Biometria ativada! Da próxima vez basta o Face ID / digital.");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível ativar a biometria");
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    biometric.markSkipped(userId);
    onDone();
  };

  return (
    <div className="mx-4 mt-3 rounded-xl border border-gold/40 bg-gold/5 p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-full bg-gold/15 flex items-center justify-center flex-shrink-0">
        <Fingerprint className="w-5 h-5 text-gold" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          Entrar mais rápido com Face ID / digital
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ative para desbloquear o app sem digitar email e senha toda vez.
        </p>
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            className="bg-gold text-black hover:bg-gold/90 h-8"
            onClick={activate}
            disabled={busy}
          >
            {busy ? "Ativando..." : "Ativar"}
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={skip}>
            Agora não
          </Button>
        </div>
      </div>
      <button
        onClick={skip}
        className="text-muted-foreground hover:text-foreground p-1 -mt-1 -mr-1"
        aria-label="Fechar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default BiometricSetupCard;
