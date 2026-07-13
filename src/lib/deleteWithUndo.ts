import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Row = { id: string; [k: string]: any };

/**
 * Deletes rows from a table and shows a Sonner toast with an "Desfazer" action
 * that reinserts the original rows (preserving id/created_at).
 *
 * The caller is responsible for optimistically updating local state via
 * `onDeleted` and reverting via `onRestored`.
 */
export async function deleteWithUndo<T extends Row>(opts: {
  table: string;
  rows: T[];
  onDeleted: () => void;
  onRestored: (rows: T[]) => void;
  label?: string;
  description?: string;
  duration?: number;
}) {
  if (!opts.rows.length) return;
  const ids = opts.rows.map((r) => r.id);

  const { error } = await supabase
    .from(opts.table as any)
    .delete()
    .in("id", ids);

  if (error) {
    toast.error(error.message);
    return;
  }

  opts.onDeleted();

  toast(opts.label ?? `${ids.length} item(ns) excluído(s)`, {
    description: opts.description,
    duration: opts.duration ?? 8000,
    action: {
      label: "Desfazer",
      onClick: async () => {
        const { error: e2 } = await supabase
          .from(opts.table as any)
          .insert(opts.rows as any);
        if (e2) {
          toast.error("Não foi possível restaurar: " + e2.message);
          return;
        }
        opts.onRestored(opts.rows);
        toast.success("Restaurado");
      },
    },
  });
}
