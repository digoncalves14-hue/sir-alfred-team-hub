import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { FileText, Upload, Trash2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Profile = { id: string; nome: string };
type Receipt = {
  id: string;
  professional_id: string;
  period_label: string;
  file_path: string;
  amount_cents: number | null;
  note: string | null;
  created_at: string;
};

const brl = (cents: number | null) =>
  cents == null ? null : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const defaultPeriod = () => {
  const d = new Date();
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

export default function Receipts() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [list, setList] = useState<Receipt[]>([]);
  const [pro, setPro] = useState("");
  const [period, setPeriod] = useState(defaultPeriod());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const loadList = async () => {
    const { data, error } = await supabase
      .from("payment_receipts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setList((data ?? []) as Receipt[]);
  };

  useEffect(() => {
    (async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("id,nome").order("nome"),
        supabase.from("user_roles").select("user_id").eq("role", "gestor"),
      ]);
      const gestorIds = new Set((r.data ?? []).map((x: { user_id: string }) => x.user_id));
      const filtered = ((p.data ?? []) as Profile[]).filter((x) => !gestorIds.has(x.id));
      setProfiles(filtered);
      if (filtered[0]) setPro(filtered[0].id);
      await loadList();
    })();
  }, []);

  const submit = async () => {
    if (!pro || !file || !period.trim() || !user) return toast.error("Escolha o profissional, o período e o PDF.");
    if (file.type !== "application/pdf") return toast.error("O comprovante precisa ser um PDF.");
    if (file.size > 10 * 1024 * 1024) return toast.error("Arquivo muito grande (máx. 10MB).");

    setSaving(true);
    const path = `${pro}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("payment-receipts").upload(path, file, {
      contentType: "application/pdf",
    });
    if (up.error) {
      setSaving(false);
      return toast.error(up.error.message);
    }
    const cents = amount.trim()
      ? Math.round(Number(amount.replace(/\./g, "").replace(",", ".")) * 100)
      : null;
    const { data, error } = await supabase
      .from("payment_receipts")
      .insert({
        professional_id: pro,
        period_label: period.trim(),
        file_path: path,
        amount_cents: Number.isFinite(cents as number) ? cents : null,
        note: note.trim() || null,
        created_by: user.id,
      })
      .select()
      .single();
    setSaving(false);
    if (error) return toast.error(error.message);
    setList([data as Receipt, ...list]);
    setFile(null);
    setAmount("");
    setNote("");
    toast.success("Comprovante enviado");
  };

  const open = async (path: string) => {
    const { data, error } = await supabase.storage.from("payment-receipts").createSignedUrl(path, 60 * 10);
    if (error || !data) return toast.error("Não foi possível abrir o arquivo.");
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const remove = async (r: Receipt) => {
    const { error } = await supabase.from("payment_receipts").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    await supabase.storage.from("payment-receipts").remove([r.file_path]);
    setList(list.filter((x) => x.id !== r.id));
    toast.success("Comprovante removido");
  };

  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.nome ?? "—";

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Comprovantes de pagamento"
        subtitle="Envie o comprovante de repasse em PDF — visível apenas para o profissional correspondente"
      />

      <Card>
        <div className="grid sm:grid-cols-3 gap-3">
          <select value={pro} onChange={(e) => setPro(e.target.value)} className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm">
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <input
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="Período (ex: agosto de 2026)"
            maxLength={60}
            className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm"
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Valor (opcional) ex: 2500,00"
            maxLength={20}
            className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm"
          />
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Observação (opcional)"
          maxLength={200}
          className="w-full mt-3 bg-secondary border border-border rounded-xl px-4 py-3 text-sm"
        />
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <label className="cursor-pointer text-sm text-muted-foreground hover:text-gold transition flex items-center gap-2 border border-border rounded-xl px-4 py-3">
            <FileText className="h-4 w-4" />
            {file ? file.name : "Selecionar PDF"}
            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <button
            onClick={submit}
            disabled={saving}
            className="gradient-gold text-background font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 hover:scale-105 transition disabled:opacity-50"
          >
            <Upload className="h-4 w-4" /> {saving ? "Enviando..." : "Enviar comprovante"}
          </button>
        </div>
      </Card>

      <div className="space-y-3">
        {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhum comprovante enviado ainda.</p>}
        {list.map((r) => (
          <Card key={r.id}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-bold">{nameOf(r.professional_id)}</p>
                <p className="text-xs text-muted-foreground">
                  {r.period_label}
                  {brl(r.amount_cents) ? ` · ${brl(r.amount_cents)}` : ""}
                  {` · ${new Date(r.created_at).toLocaleDateString("pt-BR")}`}
                </p>
                {r.note && <p className="text-sm text-muted-foreground mt-1">{r.note}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => open(r.file_path)} className="text-sm text-gold flex items-center gap-1.5 hover:underline">
                  <Download className="h-4 w-4" /> Abrir PDF
                </button>
                <button onClick={() => remove(r)} className="text-muted-foreground hover:text-destructive transition" aria-label="Excluir comprovante">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
