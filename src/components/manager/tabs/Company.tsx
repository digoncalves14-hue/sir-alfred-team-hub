import { useEffect, useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";
import { Building2, Loader2, MapPin, Plus, Save } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Branch = Tables<"branches">;

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export default function Company() {
  const { loading, companyId, company, branches, roleName, hasPermission, refresh } = useCompanyContext();
  const canManageSettings = hasPermission("settings.manage");

  const [form, setForm] = useState({ name: "", legal_name: "", cnpj: "", phone: "", whatsapp: "", email: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name ?? "",
        legal_name: company.legal_name ?? "",
        cnpj: company.cnpj ?? "",
        phone: company.phone ?? "",
        whatsapp: company.whatsapp ?? "",
        email: company.email ?? "",
      });
    }
  }, [company]);

  const [newBranch, setNewBranch] = useState({ name: "", city: "", phone: "" });
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [savingBranchId, setSavingBranchId] = useState<string | null>(null);

  const saveCompany = async () => {
    if (!companyId || !form.name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("companies")
      .update({
        name: form.name.trim(),
        legal_name: form.legal_name.trim() || null,
        cnpj: form.cnpj.trim() || null,
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        email: form.email.trim() || null,
      })
      .eq("id", companyId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Dados da empresa atualizados");
    refresh();
  };

  const createBranch = async () => {
    if (!companyId || !newBranch.name.trim()) return;
    setCreatingBranch(true);
    const slug = slugify(newBranch.name);
    const { error } = await supabase.from("branches").insert({
      company_id: companyId,
      name: newBranch.name.trim(),
      slug: slug || crypto.randomUUID().slice(0, 8),
      city: newBranch.city.trim() || null,
      phone: newBranch.phone.trim() || null,
    });
    setCreatingBranch(false);
    if (error) return toast.error(error.message);
    setNewBranch({ name: "", city: "", phone: "" });
    toast.success("Unidade criada");
    refresh();
  };

  const toggleBranchStatus = async (b: Branch) => {
    setSavingBranchId(b.id);
    const nextStatus = b.status === "active" ? "inactive" : "active";
    const { error } = await supabase.from("branches").update({ status: nextStatus }).eq("id", b.id);
    setSavingBranchId(null);
    if (error) return toast.error(error.message);
    toast.success(nextStatus === "active" ? "Unidade ativada" : "Unidade desativada");
    refresh();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="space-y-6">
        <SectionTitle title="Empresa & Unidades" />
        <Card>
          <div className="text-center py-10">
            <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold">Sua conta ainda não está vinculada a uma empresa</p>
            <p className="text-sm text-muted-foreground mt-1">
              Fale com um administrador para vincular seu acesso a uma empresa cadastrada.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionTitle title="Empresa & Unidades" subtitle={roleName ? `Seu papel: ${roleName}` : undefined} />

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="h-4 w-4 text-gold" />
          <h3 className="font-semibold">Dados da empresa</h3>
          {!canManageSettings && <Badge className="bg-muted text-muted-foreground border-border">Somente leitura</Badge>}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Nome fantasia</label>
            <input
              disabled={!canManageSettings}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full mt-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Razão social</label>
            <input
              disabled={!canManageSettings}
              value={form.legal_name}
              onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
              className="w-full mt-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">CNPJ</label>
            <input
              disabled={!canManageSettings}
              value={form.cnpj}
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              className="w-full mt-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">E-mail</label>
            <input
              disabled={!canManageSettings}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full mt-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Telefone</label>
            <input
              disabled={!canManageSettings}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full mt-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">WhatsApp</label>
            <input
              disabled={!canManageSettings}
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              className="w-full mt-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm disabled:opacity-60"
            />
          </div>
        </div>
        {canManageSettings && (
          <button
            onClick={saveCompany}
            disabled={saving || !form.name.trim()}
            className="mt-4 gradient-gold text-background font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 hover:scale-105 transition disabled:opacity-50 disabled:hover:scale-100"
          >
            <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar dados da empresa"}
          </button>
        )}
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="h-4 w-4 text-gold" />
          <h3 className="font-semibold">Unidades</h3>
        </div>

        {branches.length === 0 && <p className="text-sm text-muted-foreground italic mb-4">Nenhuma unidade cadastrada ainda.</p>}

        <div className="space-y-2 mb-4">
          {branches.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 bg-secondary/60 border border-border rounded-xl px-4 py-3">
              <div>
                <p className="font-medium text-sm">{b.name}</p>
                <p className="text-xs text-muted-foreground">{[b.city, b.phone].filter(Boolean).join(" · ") || "Sem detalhes cadastrados"}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge className={b.status === "active" ? "bg-success/20 text-success border-success/40" : "bg-muted text-muted-foreground border-border"}>
                  {b.status === "active" ? "Ativa" : "Inativa"}
                </Badge>
                {canManageSettings && (
                  <button
                    onClick={() => toggleBranchStatus(b)}
                    disabled={savingBranchId === b.id}
                    className="text-xs font-semibold text-gold hover:underline disabled:opacity-50"
                  >
                    {b.status === "active" ? "Desativar" : "Ativar"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {canManageSettings && (
          <div className="grid sm:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground">Nome da unidade</label>
              <input
                value={newBranch.name}
                onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                placeholder="Ex.: Zona Sul"
                className="w-full mt-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Cidade</label>
              <input
                value={newBranch.city}
                onChange={(e) => setNewBranch({ ...newBranch, city: e.target.value })}
                className="w-full mt-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Telefone</label>
              <input
                value={newBranch.phone}
                onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })}
                className="w-full mt-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <button
              onClick={createBranch}
              disabled={creatingBranch || !newBranch.name.trim()}
              className="gradient-gold text-background font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 hover:scale-105 transition disabled:opacity-50 disabled:hover:scale-100"
            >
              <Plus className="h-4 w-4" /> Adicionar
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
