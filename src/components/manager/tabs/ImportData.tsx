import { useState, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { Card, SectionTitle } from "@/components/ui-kit";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { deleteWithUndo } from "@/lib/deleteWithUndo";

type Row = { Comanda: string | number; Profissional: string; Serviço?: string; Servico?: string; Valor: string | number };

type Agg = {
  professional_name: string;
  services_count: number;
  comandas_count: number;
  revenue_cents: number;
  top_service: string;
};

const parseValor = (v: string | number): number => {
  if (typeof v === "number") return Math.round(v * 100);
  const clean = String(v).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : Math.round(n * 100);
};

const currentPeriod = () => {
  const d = new Date();
  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${meses[d.getMonth()]}/${d.getFullYear()}`;
};

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ImportData() {
  const { user } = useAuth();
  const [period, setPeriod] = useState(currentPeriod());
  const [aggs, setAggs] = useState<Agg[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadSaved = useCallback(async () => {
    const { data } = await supabase
      .from("performance_snapshots")
      .select("*")
      .order("period_label", { ascending: false })
      .order("revenue_cents", { ascending: false });
    setSaved(data ?? []);
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: "" });

    const byPro = new Map<string, { services: number; comandas: Set<string>; cents: number; svc: Map<string, number> }>();
    for (const r of rows) {
      const name = String(r.Profissional || "").trim();
      if (!name) continue;
      const servico = String(r.Serviço || r.Servico || "").trim();
      const comanda = String(r.Comanda || "");
      const cents = parseValor(r.Valor);
      const cur = byPro.get(name) || { services: 0, comandas: new Set<string>(), cents: 0, svc: new Map<string, number>() };
      cur.services += 1;
      if (comanda) cur.comandas.add(comanda);
      cur.cents += cents;
      if (servico) cur.svc.set(servico, (cur.svc.get(servico) || 0) + 1);
      byPro.set(name, cur);
    }

    const result: Agg[] = Array.from(byPro.entries())
      .map(([professional_name, v]) => {
        let top = "";
        let topN = 0;
        v.svc.forEach((n, s) => { if (n > topN) { topN = n; top = s; } });
        return {
          professional_name,
          services_count: v.services,
          comandas_count: v.comandas.size,
          revenue_cents: v.cents,
          top_service: top,
        };
      })
      .sort((a, b) => b.revenue_cents - a.revenue_cents);

    setAggs(result);
    toast.success(`Planilha lida: ${result.length} profissionais`);
  };

  const save = async () => {
    if (!aggs || !user) return;
    setSaving(true);
    // apagar snapshot anterior deste período
    await supabase.from("performance_snapshots").delete().eq("period_label", period);
    const rows = aggs.map((a) => ({ ...a, period_label: period, created_by: user.id }));
    const { error } = await supabase.from("performance_snapshots").insert(rows);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`Desempenho de ${period} salvo!`);
      setAggs(null);
      setFileName("");
      if (inputRef.current) inputRef.current.value = "";
      loadSaved();
    }
  };

  const removeSnapshot = async (row: any) => {
    if (!confirm(`Excluir "${row.professional_name}" (${row.period_label})?`)) return;
    await deleteWithUndo({
      table: "performance_snapshots",
      rows: [row],
      onDeleted: () => setSaved((prev) => prev.filter((r) => r.id !== row.id)),
      onRestored: (rows) => setSaved((prev) => [...(rows as any[]), ...prev]),
      label: `${row.professional_name} excluído`,
      description: `Toque em "Desfazer" para recuperar (${row.period_label}).`,
      duration: 12000,
    });
  };

  const removePeriod = async (periodLabel: string) => {
    const rows = saved.filter((r) => r.period_label === periodLabel);
    if (!rows.length) return;
    if (!confirm(`Excluir todos os ${rows.length} registros de ${periodLabel}?`)) return;
    await deleteWithUndo({
      table: "performance_snapshots",
      rows,
      onDeleted: () => setSaved((prev) => prev.filter((r) => r.period_label !== periodLabel)),
      onRestored: (rows) => setSaved((prev) => [...(rows as any[]), ...prev]),
      label: `Período ${periodLabel} excluído`,
      description: "Toque em \"Desfazer\" para recuperar.",
      duration: 12000,
    });
  };

  return (
    <div>
      <SectionTitle title="Importar dados" subtitle="Envie o Excel do AppBarber (Relatório de Profissionais) para atualizar as métricas" />

      <Card className="mb-4">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Período de referência</label>
            <input
              type="text"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="Ex: Julho/2026"
              className="w-full bg-secondary border border-border rounded-lg px-4 py-2 text-sm"
            />
          </div>

          <div>
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gold/40 rounded-lg p-6 cursor-pointer hover:border-gold hover:bg-gold/5 transition">
              <Upload className="h-5 w-5 text-gold" />
              <span className="text-sm font-semibold">
                {fileName || "Escolher planilha .xlsx"}
              </span>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3">
            <FileSpreadsheet className="h-4 w-4 text-gold shrink-0 mt-0.5" />
            <p>
              Exporte do AppBarber → <strong>Relatório de Profissionais</strong> (Excel). Colunas esperadas: Comanda, Profissional, Serviço, Valor, Forma Pgto.
            </p>
          </div>
        </div>
      </Card>

      {aggs && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gold">Pré-visualização</p>
              <p className="text-sm text-muted-foreground">{aggs.length} profissionais · período <strong>{period}</strong></p>
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="gradient-gold text-background font-bold px-5 py-2 rounded-full text-sm shadow-gold disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar desempenho"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                  <th className="py-2">Profissional</th>
                  <th className="py-2 text-right">Atend.</th>
                  <th className="py-2 text-right">Comandas</th>
                  <th className="py-2 text-right">Faturamento</th>
                  <th className="py-2">Top serviço</th>
                </tr>
              </thead>
              <tbody>
                {aggs.map((a) => (
                  <tr key={a.professional_name} className="border-b border-border/50">
                    <td className="py-2 font-semibold">{a.professional_name}</td>
                    <td className="py-2 text-right">{a.services_count}</td>
                    <td className="py-2 text-right">{a.comandas_count}</td>
                    <td className="py-2 text-right text-gold font-bold">{fmtBRL(a.revenue_cents)}</td>
                    <td className="py-2 text-xs text-muted-foreground">{a.top_service || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground mt-4">
            <AlertCircle className="h-4 w-4 text-gold shrink-0 mt-0.5" />
            <p>Ao salvar, o desempenho anterior deste período será substituído. Os cards da home dos profissionais serão atualizados automaticamente.</p>
          </div>
        </Card>
      )}

      {!aggs && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <p>Dica: importe 1x por semana ou por mês, conforme o ritmo da equipe.</p>
        </div>
      )}
    </div>
  );
}
