import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";

type Company = Tables<"companies">;
type Branch = Tables<"branches">;

interface CompanyContextValue {
  loading: boolean;
  companyId: string | null;
  company: Company | null;
  branches: Branch[];
  roleName: string | null;
  permissions: Set<string>;
  hasPermission: (code: string) => boolean;
  refresh: () => Promise<void>;
}

/**
 * Carrega o vínculo empresa/unidade/papel/permissões do usuário logado
 * (tabela staff_members) e resolve as permissões efetivas do papel via
 * role_permissions. Um usuário sem staff_member ativo não tem empresa
 * (companyId null) — telas consumidoras devem tratar esse estado vazio.
 */
export function useCompanyContext(): CompanyContextValue {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roleName, setRoleName] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setCompanyId(null);
      setCompany(null);
      setBranches([]);
      setRoleName(null);
      setPermissions(new Set());
      return;
    }
    setLoading(true);

    const { data: staff, error: staffErr } = await supabase
      .from("staff_members")
      .select("company_id, role_id, roles(name, slug)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (staffErr || !staff) {
      setLoading(false);
      setCompanyId(null);
      setCompany(null);
      setBranches([]);
      setRoleName(null);
      setPermissions(new Set());
      return;
    }

    const [{ data: companyRow }, { data: branchRows }, { data: permRows }] = await Promise.all([
      supabase.from("companies").select("*").eq("id", staff.company_id).maybeSingle(),
      supabase.from("branches").select("*").eq("company_id", staff.company_id).is("deleted_at", null).order("name"),
      supabase.from("role_permissions").select("permissions(code)").eq("role_id", staff.role_id),
    ]);

    setCompanyId(staff.company_id);
    setCompany(companyRow ?? null);
    setBranches(branchRows ?? []);
    setRoleName((staff.roles as { name: string } | null)?.name ?? null);
    setPermissions(new Set((permRows ?? []).map((r) => (r.permissions as { code: string } | null)?.code).filter((c): c is string => !!c)));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    loading,
    companyId,
    company,
    branches,
    roleName,
    permissions,
    hasPermission: (code: string) => permissions.has(code),
    refresh: load,
  };
}
