import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Play, Save, Loader2, ShieldAlert, KeyRound, Eye, EyeOff, CheckCircle2 } from "lucide-react";

type Endpoint = { name: string; path: string };

export default function AppBarberSettings() {
  const [id, setId] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);

  // Chave da API
  const [credId, setCredId] = useState<string | null>(null);
  const [keyHint, setKeyHint] = useState<string | null>(null);
  const [keyUpdatedAt, setKeyUpdatedAt] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);

  const keyError = (() => {
    const v = apiKey.trim();
    if (!v) return null;
    if (/\s/.test(v)) return "A chave não pode conter espaços.";
    if (v.length < 12) return "Chave muito curta — confira se copiou tudo.";
    if (!/^[A-Za-z0-9._\-:]+$/.test(v)) return "A chave contém caracteres inválidos.";
    return null;
  })();
  const keyValid = apiKey.trim().length > 0 && !keyError;

  const saveKey = async () => {
    if (!keyValid) return;
    const value = apiKey.trim();
    const hint = `••••${value.slice(-4)}`;
    setSavingKey(true);
    const payload = { api_key: value, key_hint: hint, updated_at: new Date().toISOString() };
    const { error } = credId
      ? await supabase.from("appbarber_credentials").update(payload).eq("id", credId)
      : await supabase.from("appbarber_credentials").insert(payload);
    setSavingKey(false);
    if (error) return toast.error(error.message);
    setApiKey("");
    setShowKey(false);
    const { data } = await supabase
      .from("appbarber_credentials")
      .select("id, key_hint, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setCredId(data.id);
      setKeyHint(data.key_hint);
      setKeyUpdatedAt(data.updated_at);
    }
    toast.success("Chave salva com segurança.");
  };


  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("appbarber_config")
        .select("id, base_url, endpoints")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) toast.error(error.message);
      if (data) {
        setId(data.id);
        setBaseUrl(data.base_url ?? "");
        setEndpoints(Array.isArray(data.endpoints) ? (data.endpoints as unknown as Endpoint[]) : []);
      }
      setLoading(false);
    })();
  }, []);

  const updateEp = (i: number, field: keyof Endpoint, value: string) => {
    setEndpoints((prev) => prev.map((ep, idx) => (idx === i ? { ...ep, [field]: value } : ep)));
  };
  const addEp = () => setEndpoints((prev) => [...prev, { name: "", path: "" }]);
  const removeEp = (i: number) => setEndpoints((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    const payload = {
      base_url: baseUrl.trim().replace(/\/$/, ""),
      endpoints: endpoints.filter((e) => e.path.trim()).map((e) => ({ name: e.name.trim() || e.path, path: e.path.trim() })),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = id
      ? await supabase.from("appbarber_config").update(payload).eq("id", id).select("id").maybeSingle()
      : await supabase.from("appbarber_config").insert(payload).select("id").maybeSingle();
    setSaving(false);
    if (error) return toast.error(error.message);
    if (data?.id) setId(data.id);
    toast.success("Configuração salva.");
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    setDiagnosis(null);
    const { data, error } = await supabase.functions.invoke("appbarber-test");
    setTesting(false);
    if (error) {
      toast.error(error.message);
      setResult({ error: error.message });
      return;
    }
    setResult(data);
    toast.success("Teste concluído. Confira os resultados abaixo.");
  };

  const diagnoseProxy = async () => {
    setDiagnosing(true);
    setResult(null);
    setDiagnosis(null);
    const fakeBase = "https://exemplo-invalido-lovable-diagnostico-xyz.com";
    const probePath = endpoints[0]?.path || "/v1/ping";
    const { data, error } = await supabase.functions.invoke("appbarber-test", {
      body: {
        base_url: fakeBase,
        endpoints: [{ name: "Diagnóstico", path: probePath }],
      },
    });
    setDiagnosing(false);
    if (error) {
      toast.error(error.message);
      setResult({ error: error.message });
      return;
    }
    setResult(data);
    const probe = (data as Record<string, { status?: number; body?: unknown }> | null)?.["Diagnóstico"];
    const status = probe?.status;
    const bodyStr = JSON.stringify(probe?.body ?? "").toLowerCase();
    if (status === 0 || /getaddrinfo|enotfound|dns|econnrefused|failed to fetch|network|resolve/.test(bodyStr)) {
      setDiagnosis(
        "✅ Proxy está RESPEITANDO o header X-Target-Base (deu erro de conexão porque a URL é inválida). Logo, o problema com a AppBarber é a URL base real ou os caminhos dos endpoints — não o proxy.",
      );
    } else if (status && status >= 200 && status < 500) {
      setDiagnosis(
        `❌ Proxy está IGNORANDO o header X-Target-Base. Retornou HTTP ${status} para uma URL inexistente, ou seja, mandou a chamada para outro destino fixo. Ajuste na VPS: leia o header 'X-Target-Base' e use-o como origem da requisição.`,
      );
    } else {
      setDiagnosis(
        `Resultado ambíguo (HTTP ${status ?? "?"}). Veja o corpo abaixo — se citar DNS/conexão, o proxy está OK; se parecer resposta de servidor, está ignorando o header.`,
      );
    }
    toast.success("Diagnóstico concluído.");
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Configurações AppBarber"
        subtitle="Ajuste a URL base da API e os caminhos dos endpoints para testar sem mexer no código."
      />

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <>
          <Card className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">URL base</label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.appbarber.com.br"
                className="mt-2 w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-gold focus:outline-none text-sm"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Enviada ao proxy VPS via cabeçalho <code>X-Target-Base</code>. Não coloque barra no final.
              </p>
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold">Endpoints</p>
                <p className="text-xs text-muted-foreground">Nome descritivo + caminho (começa com /).</p>
              </div>
              <button
                onClick={addEp}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-background transition"
              >
                <Plus className="h-4 w-4" /> Adicionar
              </button>
            </div>

            <div className="space-y-3">
              {endpoints.length === 0 && (
                <p className="text-sm text-muted-foreground italic">Nenhum endpoint. Clique em "Adicionar".</p>
              )}
              {endpoints.map((ep, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2">
                  <input
                    value={ep.name}
                    onChange={(e) => updateEp(i, "name", e.target.value)}
                    placeholder="Nome (ex: Serviços)"
                    className="px-3 py-2 rounded-lg bg-background border border-border focus:border-gold focus:outline-none text-sm"
                  />
                  <input
                    value={ep.path}
                    onChange={(e) => updateEp(i, "path", e.target.value)}
                    placeholder="/v1/services?establishment_code=709052"
                    className="px-3 py-2 rounded-lg bg-background border border-border focus:border-gold focus:outline-none text-sm font-mono"
                  />
                  <button
                    onClick={() => removeEp(i)}
                    className="p-2 rounded-lg border border-border text-destructive hover:bg-destructive/10 transition"
                    aria-label="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-3 rounded-xl gradient-gold text-background font-bold shadow-gold disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </button>
            <button
              onClick={test}
              disabled={testing}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border border-gold text-gold font-semibold hover:bg-gold/10 transition disabled:opacity-60"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Testar agora
            </button>
            <button
              onClick={diagnoseProxy}
              disabled={diagnosing}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border border-border text-foreground font-semibold hover:bg-background transition disabled:opacity-60"
              title="Envia uma URL base falsa ao proxy para verificar se ele respeita o header X-Target-Base"
            >
              {diagnosing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
              Diagnosticar proxy
            </button>
          </div>

          {diagnosis && (
            <Card className="border-gold/40">
              <p className="font-bold mb-2">Diagnóstico do proxy</p>
              <p className="text-sm leading-relaxed">{diagnosis}</p>
            </Card>
          )}

          {result !== null && (
            <Card>
              <p className="font-bold mb-3">Resultado</p>
              <pre className="text-xs bg-background rounded-lg p-4 overflow-auto max-h-[500px] whitespace-pre-wrap break-all">
                {JSON.stringify(result, null, 2)}
              </pre>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
