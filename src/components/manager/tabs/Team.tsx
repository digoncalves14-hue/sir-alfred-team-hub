import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { Avatar } from "@/components/Avatar";
import { AvatarUpload } from "@/components/AvatarUpload";
import { team } from "@/data/team";
import { usePhotos } from "@/hooks/usePhotos";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Crown, Link2, Loader2, User } from "lucide-react";

type DbProfile = {
  id: string;
  nome: string;
  cargo: string | null;
  unidade: string | null;
  foto_url: string | null;
  roles: string[];
};

const initialsOf = (name: string) =>
  name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

export default function Team() {
  const { user } = useAuth();
  const { getPhoto, refresh } = usePhotos();
  const [dbProfiles, setDbProfiles] = useState<DbProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchProfiles = async () => {
    setLoading(true);
    const [{ data: profiles, error: profilesErr }, { data: roles, error: rolesErr }] = await Promise.all([
      supabase.from("profiles").select("id, nome, cargo, unidade, foto_url"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (profilesErr || rolesErr) {
      toast.error("Erro ao carregar equipe");
      setLoading(false);
      return;
    }
    const rolesByUser = (roles ?? []).reduce<Record<string, string[]>>((acc, r) => {
      acc[r.user_id] = acc[r.user_id] ?? [];
      acc[r.user_id].push(r.role);
      return acc;
    }, {});
    setDbProfiles(
      (profiles ?? []).map((p) => ({
        ...p,
        roles: rolesByUser[p.id] ?? [],
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const signupLink = `${typeof window !== "undefined" ? window.location.origin : ""}/?signup=1`;

  const copyLink = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(signupLink);
      } else {
        const ta = document.createElement("textarea");
        ta.value = signupLink;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("execCommand failed");
      }
      toast.success("Link de cadastro copiado!");
    } catch {
      try {
        window.prompt("Copie o link de cadastro:", signupLink);
      } catch {
        toast.error("Não foi possível copiar. Copie manualmente: " + signupLink);
      }
    }
  };

  const toggleGestor = async (p: DbProfile, makeGestor: boolean) => {
    if (!user) return;
    setTogglingId(p.id);
    try {
      if (makeGestor) {
        const { error } = await supabase.from("user_roles").insert({ user_id: p.id, role: "gestor" });
        if (error) throw error;
        toast.success(`${p.nome} agora tem acesso de gestor(a)`);
      } else {
        if (p.id === user.id) {
          toast.error("Você não pode remover o próprio acesso de gestor(a).");
          return;
        }
        const { error } = await supabase.from("user_roles").delete().eq("user_id", p.id).eq("role", "gestor");
        if (error) throw error;
        toast.success(`${p.nome} deixou de ser gestor(a)`);
      }
      await fetchProfiles();
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar permissão");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-foreground">Convidar profissional</h2>
          <p className="text-sm text-muted-foreground">
            Envie o link de cadastro para quem vai acessar como profissional.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-2 rounded-xl bg-card border border-border text-xs text-muted-foreground truncate max-w-[16rem]">
            {signupLink}
          </div>
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-gold text-background font-bold text-sm shadow-gold hover:scale-[1.02] transition-all"
          >
            <Link2 className="h-4 w-4" />
            Copiar link
          </button>
        </div>
      </div>

      <div>
        <SectionTitle title="Profissionais cadastrados" subtitle="Toque na foto para enviar/atualizar. Use a coroa para gerenciar acesso de gestor(a)." />
        {loading && dbProfiles.length === 0 && (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        )}
        {dbProfiles.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dbProfiles.map((p) => {
              const isGestor = p.roles.includes("gestor");
              const isSelf = p.id === user?.id;
              return (
                <Card key={p.id} className="hover:border-gold/50 transition-all">
                  <div className="flex items-center gap-4">
                    <AvatarUpload
                      userId={p.id}
                      initials={initialsOf(p.nome)}
                      photoUrl={p.foto_url}
                      size="lg"
                      onUploaded={(url) => {
                        setDbProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, foto_url: url } : x)));
                        refresh();
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-foreground truncate">{p.nome}</p>
                      {p.cargo && <p className="text-xs text-gold uppercase tracking-wider mt-0.5">{p.cargo}</p>}
                      {p.unidade && <p className="text-xs text-muted-foreground mt-1">{p.unidade}</p>}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {p.roles.map((r) => (
                          <span
                            key={r}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              r === "gestor" ? "bg-gold/20 text-gold" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {r === "gestor" ? <Crown className="h-3 w-3" /> : <User className="h-3 w-3" />}
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleGestor(p, !isGestor)}
                      disabled={togglingId === p.id || (isSelf && isGestor)}
                      title={isGestor ? "Remover acesso de gestor(a)" : "Tornar gestor(a)"}
                      className={`shrink-0 p-2 rounded-xl border transition-all disabled:opacity-40 ${
                        isGestor
                          ? "border-gold text-gold hover:bg-gold hover:text-background"
                          : "border-border text-muted-foreground hover:border-gold hover:text-gold"
                      }`}
                    >
                      {togglingId === p.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Crown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <SectionTitle title="Equipe Sir Alfred" subtitle="Visão geral da rede" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {team.map((p) => (
            <Card key={p.id} className="hover:border-gold/50 hover:scale-[1.02] transition-all cursor-pointer">
              <div className="flex items-center gap-4">
                <Avatar initials={p.initials} photoUrl={getPhoto(p.name)} size="lg" />
                <div className="min-w-0">
                  <p className="font-bold text-foreground truncate">{p.name}</p>
                  <p className="text-xs text-gold uppercase tracking-wider mt-0.5">{p.role}</p>
                  <p className="text-xs text-muted-foreground mt-1">{p.unit}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
