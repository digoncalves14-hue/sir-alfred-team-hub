import { useEffect, useState } from "react";
import { Fingerprint, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { biometric } from "@/hooks/useBiometric";
import { toast } from "sonner";

interface Props {
  userId: string;
  onUnlocked: () => void;
  onUsePassword: () => void;
}

const BiometricLock = ({ userId, onUnlocked, onUsePassword }: Props) => {
  const [busy, setBusy] = useState(false);

  const unlock = async () => {
    setBusy(true);
    const ok = await biometric.verify(userId);
    setBusy(false);
    if (ok) onUnlocked();
    else toast.error("Não foi possível desbloquear. Tente novamente.");
  };

  // Auto-prompt on mount
  useEffect(() => {
    unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="w-24 h-24 rounded-full border-2 border-gold/40 flex items-center justify-center mb-6 bg-gold/5">
        <Fingerprint className="w-12 h-12 text-gold" />
      </div>
      <h1 className="text-xl font-semibold text-foreground mb-2">Sir Alfred Equipe</h1>
      <p className="text-sm text-muted-foreground mb-8 text-center">
        Toque para desbloquear com biometria
      </p>
      <Button
        onClick={unlock}
        disabled={busy}
        className="bg-gold text-black hover:bg-gold/90 min-w-56"
        size="lg"
      >
        <Fingerprint className="w-5 h-5 mr-2" />
        {busy ? "Aguardando..." : "Desbloquear"}
      </Button>
      <button
        onClick={onUsePassword}
        className="mt-6 text-sm text-muted-foreground flex items-center gap-2 hover:text-foreground"
      >
        <LogOut className="w-4 h-4" />
        Usar email e senha
      </button>
    </div>
  );
};

export default BiometricLock;
