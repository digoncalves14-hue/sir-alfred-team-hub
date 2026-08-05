import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  tab: string | null;
  read_at: string | null;
  created_at: string;
};

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, kind, title, body, tab, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setItems((data ?? []) as AppNotification[]);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => setItems((prev) => [payload.new as AppNotification, ...prev].slice(0, 50)),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const unread = items.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
  };

  const markRead = async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  };

  return { items, unread, markAllRead, markRead, reload: load };
}
