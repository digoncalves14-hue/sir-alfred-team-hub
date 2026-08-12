import { useEffect, useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";
import { deleteWithUndo } from "@/lib/deleteWithUndo";
import { Loader2, Plus, Scissors, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Service = Tables<"services">;

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const emptyForm = {
  name: "",
  category: "",
  duration_minutes: "30",
  price: "",
  promo_price: "",
  branch_id: "",
};

export default function Services() {
  const { loading: ctxLoading, companyId, branches, hasPermission } = useCompanyContext();
  const canManage = hasPermission("services.manage");

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!companyId) {
      setServices([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name");
    if (error) toast.error(error.message);
    else setServices(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const createService = async () => {
    if (!companyId) return;
    const duration = parseInt(form.duration_minutes, 10);
    const price = parseFloat(form.price.replace(",", "."));
    if (!form.name.trim() || !duration || duration <= 0 || isNaN(price) || price < 0) {
      toast.error("Preencha nome, duração e preço corretamente");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("services").insert({
      company_id: companyId,
      branch_id: form.branch_id || null,
      name: form.name.trim(),
      category: form.category.trim() || null,
      duration_minutes: duration,
      price,
      promo_price: form.promo_price ? parseFloat(form.promo_price.replace(",", ".")) : null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setForm(emptyForm);
    toast.success("Serviço criado");
    load();
  };

  const toggleActive = async (s: Service) => {
    const { error } = await supabase.from("services").update({ active: !s.active }).eq("id", s.id);
    if (error) return toast.error(error.message);
    setServices((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: !s.active } : x)));
  };

  const remove = async (s: Service) => {
    const snapshot = services;
    await deleteWithUndo({
      table: "services",
      rows: [s],
      onDeleted: () => setServices((prev) => prev.filter((x) => x.id !== s.id)),
      onRestored: () => setServices(snapshot),
      label: "Serviço excluído",
    });
  };

  if (ctxLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="space-y-6">
        <SectionTitle title="Serviços" />
        <Card>
          <div className="text-center py-10">
            <Scissors className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold">Sua conta ainda não está vinculada a uma empresa</p>
            <p className="text-sm text-muted-foreground mt-1">Fale com um administrador para liberar seu acesso.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionTitle title="Serviços" subtitle="Catálogo de serviços oferecidos pela empresa" />

      {canManage && (
        <Card>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Plus className="h-4 w-4 text-gold" /> Novo serviço
          </h3>
          <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            <div className="lg:col-span-2">
              <label className="text-xs text-muted-foreground">Nome</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: Corte + Barba"
                className="w-full mt-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Categoria</label>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Corte"
                className="w-full mt-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Duração (min)</label>
              <input
                type="number"
                min={1}
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                className="w-full mt-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Preço (R$)</label>
              <input
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="60,00"
                className="w-full mt-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Unidade</label>
              <select
                value={form.branch_id}
                onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                className="w-full mt-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm"
              >
                <option value="">Toda a empresa</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={createService}
            disabled={saving}
            className="mt-4 gradient-gold text-background font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 hover:scale-105 transition disabled:opacity-50 disabled:hover:scale-100"
          >
            <Plus className="h-4 w-4" /> {saving ? "Criando..." : "Criar serviço"}
          </button>
        </Card>
      )}

      {services.length === 0 && (
        <Card>
          <p className="text-sm text-muted-foreground italic">Nenhum serviço cadastrado ainda.</p>
        </Card>
      )}

      <div className="space-y-2">
        {services.map((s) => {
          const branch = branches.find((b) => b.id === s.branch_id);
          return (
            <Card key={s.id} className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">{s.name}</p>
                  {s.category && <Badge className="bg-secondary text-muted-foreground border-border">{s.category}</Badge>}
                  {!s.active && <Badge className="bg-muted text-muted-foreground border-border">Inativo</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {s.duration_minutes} min · {currency(Number(s.price))}
                  {s.promo_price ? ` (promo ${currency(Number(s.promo_price))})` : ""} · {branch ? branch.name : "Toda a empresa"}
                </p>
              </div>
              {canManage && (
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleActive(s)} className="text-xs font-semibold text-gold hover:underline">
                    {s.active ? "Desativar" : "Ativar"}
                  </button>
                  <button onClick={() => remove(s)} className="text-muted-foreground hover:text-destructive transition" aria-label="Excluir serviço">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
