import { useAuth } from "@/hooks/useAuth";
import Auth from "./Auth";
import ManagerView from "@/components/manager/ManagerView";
import ProfessionalView from "@/components/professional/ProfessionalView";
import { Loader2 } from "lucide-react";

const Index = () => {
  const { user, role, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  if (!user) return <Auth />;

  if (role === "gestor") return <ManagerView onLogout={signOut} />;
  return <ProfessionalView onLogout={signOut} />;
};

export default Index;
