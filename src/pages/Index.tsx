import { useState } from "react";
import Login from "@/components/Login";
import ManagerView from "@/components/manager/ManagerView";
import ProfessionalView from "@/components/professional/ProfessionalView";

type View = "login" | "manager" | "professional";

const Index = () => {
  const [view, setView] = useState<View>("login");
  if (view === "login") return <Login onSelect={(v) => setView(v)} />;
  if (view === "manager") return <ManagerView onLogout={() => setView("login")} />;
  return <ProfessionalView onLogout={() => setView("login")} />;
};

export default Index;
