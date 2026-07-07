import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { Avatar } from "@/components/Avatar";
import { AvatarUpload } from "@/components/AvatarUpload";
import { team } from "@/data/team";
import { usePhotos } from "@/hooks/usePhotos";
import { supabase } from "@/integrations/supabase/client";

type DbProfile = { id: string; nome: string; cargo: string | null; unidade: string | null; foto_url: string | null };

const initialsOf = (name: string) =>
  name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

export default function Team() {
  const { getPhoto, refresh } = usePhotos();
  const [dbProfiles, setDbProfiles] = useState<DbProfile[]>([]);

  useEffect(() => {
    supabase.from("profiles").select("id, nome, cargo, unidade, foto_url").then(({ data }) => {
      setDbProfiles((data ?? []) as DbProfile[]);
    });
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <a
          href="/?signup=1"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-gold text-background font-bold text-sm shadow-gold hover:scale-[1.02] transition-all"
        >
          + Cadastrar profissional
        </a>
      </div>

      {dbProfiles.length > 0 && (
        <div>
          <SectionTitle title="Profissionais cadastrados" subtitle="Toque na foto para enviar/atualizar" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dbProfiles.map((p) => (
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
                  <div className="min-w-0">
                    <p className="font-bold text-foreground truncate">{p.nome}</p>
                    {p.cargo && <p className="text-xs text-gold uppercase tracking-wider mt-0.5">{p.cargo}</p>}
                    {p.unidade && <p className="text-xs text-muted-foreground mt-1">{p.unidade}</p>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

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
