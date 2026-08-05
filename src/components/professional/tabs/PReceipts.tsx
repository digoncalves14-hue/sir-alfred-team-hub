import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Receipt = {
  id: string;
  period_label: string;
  file_path: string;
  amount_cents: number | null;
  note: string | null;
  created_at: string;
};

const brl = (cents: number | null) =>
  cents == null ? null : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PReceipts() {
  const { user } = useAuth();
  const [list, setList] = useState<Receipt[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("payment_receipts")
      .select("id,period_label,file_path,amount_cents,note,created_at")
      .eq("professional_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setList((data ?? []) as Receipt[]));
  }, [user]);

  const open = async (path: string) => {
    const { data, error } = await supabase.storage.from("payment-receipts").createSignedUrl(path, 60 * 10);
    if (error || !data) return toast.error("Não foi possível abrir o arquivo.");
    window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <div className="space-y-6">
      <SectionTitle title="Comprovantes" subtitle="Seus comprovantes de pagamento em PDF" />
      {list.length === 0 ? (
        <Card><p className="text-sm text-muted-foreground">Nenhum comprovante disponível ainda.</p></Card>
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <Card key={r.id}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-bold">{r.period_label}</p>
                  <p className="text-xs text-muted-foreground">
                    {brl(r.amount_cents) ? `${brl(r.amount_cents)} · ` : ""}
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </p>
                  {r.note && <p className="text-sm text-muted-foreground mt-1">{r.note}</p>}
                </div>
                <button onClick={() => open(r.file_path)} className="text-sm text-gold flex items-center gap-1.5 hover:underline">
                  <Download className="h-4 w-4" /> Abrir PDF
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
