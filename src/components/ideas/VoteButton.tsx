import { useEffect, useState } from "react";
import { ArrowBigUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Props = { ideaId: string; compact?: boolean };

export default function VoteButton({ ideaId, compact }: Props) {
  const [count, setCount] = useState(0);
  const [voted, setVoted] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id ?? null;
      const [{ data: counts }, { data: mine }] = await Promise.all([
        supabase.rpc("get_idea_vote_counts"),
        userId
          ? supabase.from("idea_votes").select("idea_id").eq("idea_id", ideaId).eq("user_id", userId)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      if (!active) return;
      const row = (counts || []).find((c: any) => c.idea_id === ideaId);
      setUid(userId);
      setCount(row ? Number(row.votes) : 0);
      setVoted((mine?.length ?? 0) > 0);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [ideaId]);

  const toggle = async () => {
    if (!uid || busy) return;
    setBusy(true);
    if (voted) {
      const { error } = await supabase
        .from("idea_votes")
        .delete()
        .eq("idea_id", ideaId)
        .eq("user_id", uid);
      if (error) toast.error("Erro ao remover voto");
      else {
        setVoted(false);
        setCount((c) => Math.max(0, c - 1));
      }
    } else {
      const { error } = await supabase
        .from("idea_votes")
        .insert({ idea_id: ideaId, user_id: uid });
      if (error) toast.error("Erro ao votar");
      else {
        setVoted(true);
        setCount((c) => c + 1);
      }
    }
    setBusy(false);
  };

  const size = compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs";

  return (
    <button
      onClick={toggle}
      disabled={busy || loading || !uid}
      className={`inline-flex items-center gap-1 rounded-full border font-semibold transition ${size} ${
        voted
          ? "bg-gold/20 border-gold text-gold"
          : "border-border text-muted-foreground hover:text-foreground"
      } disabled:opacity-50`}
      title={voted ? "Remover meu voto" : "Votar nesta ideia"}
    >
      {busy || loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <ArrowBigUp className={`h-3.5 w-3.5 ${voted ? "fill-gold" : ""}`} />
      )}
      <span>{count}</span>
    </button>
  );
}
