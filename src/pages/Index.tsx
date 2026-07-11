import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { biometric } from "@/hooks/useBiometric";
import Auth from "./Auth";
import ManagerView from "@/components/manager/ManagerView";
import ProfessionalView from "@/components/professional/ProfessionalView";
import BiometricLock from "@/components/BiometricLock";
import BiometricSetupCard from "@/components/BiometricSetupCard";
import { Loader2 } from "lucide-react";

const Index = () => {
  const { user, role, loading, signOut } = useAuth();
  const [bioSupported, setBioSupported] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user) {
      setChecked(false);
      setNeedsUnlock(false);
      setShowSetup(false);
      return;
    }
    (async () => {
      const supported = await biometric.isSupported();
      setBioSupported(supported);
      if (supported && biometric.hasCredential(user.id)) {
        if (!biometric.isUnlockedForSession(user.id)) setNeedsUnlock(true);
      } else if (supported && !biometric.hasSkipped(user.id)) {
        setShowSetup(true);
      }
      setChecked(true);
    })();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  if (!user) return <Auth />;

  if (checked && needsUnlock) {
    return (
      <BiometricLock
        userId={user.id}
        onUnlocked={() => setNeedsUnlock(false)}
        onUsePassword={async () => {
          biometric.clear(user.id);
          await signOut();
        }}
      />
    );
  }

  const setupBanner =
    bioSupported && showSetup ? (
      <BiometricSetupCard
        userId={user.id}
        userLabel={user.email ?? "profissional"}
        onDone={() => setShowSetup(false)}
      />
    ) : null;

  const handleLogout = async () => {
    biometric.clear(user.id);
    await signOut();
  };

  if (role === "gestor")
    return (
      <>
        {setupBanner}
        <ManagerView onLogout={handleLogout} />
      </>
    );
  return (
    <>
      {setupBanner}
      <ProfessionalView onLogout={handleLogout} />
    </>
  );
};

export default Index;
