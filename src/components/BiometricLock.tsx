import { useEffect, useRef, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const tried = useRef(false);

  const unlock = async () => {
    setBusy(true);
    setError(null);
    const reason = await biometric.verify(userId);
    setBusy(false);
    if (!reason) {
      onUnlocked();
      return;
    }
    setFailures((f) => f + 1);
    setError(reason);
    toast.error(reason);
  };

  // Tenta automaticamente ao abrir a tela (iOS às vezes exige toque; nesse caso o botão resolve)
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const continueWithoutBiometrics = () => {
    // A sessão já está válida — só liberamos o app e removemos o cadastro quebrado.
    biometric.clear(userId);
    biometric.markSkipped(userId);
    biometric.markUnlocked(userId);
    onUnlocked();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="w-24 h-24 rounded-full border-2 border-gold/40 flex items-center justify-center mb-6 bg-gold/5">
        <Fingerprint className="w-12 h-12 text-gold" />
      </div>
      <h1 className="text-xl font-semibold text-foreground mb-2">Sir Alfred Equipe</h1>
      <p className="text-sm text-muted-foreground mb-8 text-center">
        Toque no botão abaixo para desbloquear com Face ID / digital
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
      {error && (
        <p className="mt-4 text-xs text-destructive text-center max-w-xs">{error}</p>
      )}

      <button
        onClick={continueWithoutBiometrics}
        className="mt-6 text-sm text-gold underline underline-offset-4 hover:text-gold/80"
      >
        Entrar sem biometria
      </button>
      {failures > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground text-center max-w-xs">
          Se o Face ID não abrir, use "Entrar sem biometria" — você continua logado e pode
          cadastrar de novo depois.
        </p>
      )}

      <button
        onClick={onUsePassword}
        className="mt-6 text-sm text-muted-foreground flex items-center gap-2 hover:text-foreground"
      >
        <LogOut className="w-4 h-4" />
        Sair e usar email e senha
      </button>
    </div>
  );
};

export default BiometricLock;
