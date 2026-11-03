import {
  SHEET_DATASETS,
  SHEET_DATASET_LABELS,
  SPACE_LABELS,
  SpaceSchema,
  type Report,
  type SheetDataset,
  type SpaceOverview,
} from "@jarvis/shared";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MetricsCard } from "@/components/business";
import { Button, Card, Empty, ErrorBanner, Icon, Screen, SectionTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { connectHub } from "@/lib/hub";
import { relativeTime } from "@/logic/format";
import { colors, font, radius, space } from "@/theme";

/** Sugestão de tipo de planilha por espaço. */
const SUGGESTED: Record<string, SheetDataset> = { black_bear: "vendas", alfie_fred: "vendas", educacao: "cronograma", barton: "indicadores", sir_alfred: "indicadores" };

export default function SpaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const spaceId = SpaceSchema.safeParse(id).success ? SpaceSchema.parse(id) : null;
  const [overview, setOverview] = useState<SpaceOverview | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [available, setAvailable] = useState({ hub: false, sheets: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; link: string; range: string; dataset: SheetDataset } | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (!spaceId) return;
      setLoading(true);
      setError(null);
      try {
        const [ov, rp, cs] = await Promise.all([api.businessOverview(spaceId, refresh), api.reports(spaceId), api.connectors()]);
        setOverview(ov.spaces[0] ?? null);
        setReports(rp.reports.slice(0, 10));
        setAvailable(cs.available);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao carregar.");
      } finally {
        setLoading(false);
      }
    },
    [spaceId],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!spaceId) return <Empty title="Espaço inválido." />;
  const hasHub = overview?.connectors.some((c) => c.type === "sir_alfred_hub");

  const doHub = async () => {
    setBusy("hub");
    try {
      const r = await connectHub();
      if (r.ok) {
        Alert.alert("Hub conectado", r.account ?? "Conta autorizada");
        await load(true);
      } else if (!r.cancelled) setError(r.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao conectar o Hub.");
    } finally {
      setBusy(null);
    }
  };

  const addSheet = async () => {
    if (!form) return;
    setBusy("sheet");
    setError(null);
    try {
      await api.createSheetConnector({ space: spaceId, name: form.name.trim() || SHEET_DATASET_LABELS[form.dataset], spreadsheet: form.link, range: form.range || undefined, dataset: form.dataset });
      setForm(null);
      await load(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao conectar a planilha.";
      setError(/Planilhas/.test(msg) ? `${msg} Vá em Ajustes › Integrações, marque "Planilhas" e reconecte o Google.` : msg);
    } finally {
      setBusy(null);
    }
  };

  const removeConnector = (connectorId: string, name: string) =>
    Alert.alert("Remover fonte?", `"${name}" deixará de alimentar os indicadores. A credencial salva será apagada.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: async () => {
          await api.deleteConnector(connectorId).catch((e) => setError(String(e)));
          await load();
        },
      },
    ]);

  const generate = async (kind: "relatorio_negocios" | "alerta_estoque" | "pendencias") => {
    setBusy(kind);
    try {
      const { report } = await api.generateReport(kind, spaceId);
      router.push({ pathname: "/report/[id]", params: { id: report.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen top={false}>
      <Stack.Screen options={{ title: SPACE_LABELS[spaceId] }} />
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(true)} tintColor={colors.cyan} />} contentContainerStyle={{ paddingVertical: space(3), paddingBottom: space(12), gap: space(3) }}>
        {error ? <ErrorBanner message={error} /> : null}

        {overview?.metrics.length ? (
          overview.metrics.map((m) => (
            <MetricsCard
              key={m.connectorId}
              m={m}
              actions={
                <Pressable onPress={() => removeConnector(m.connectorId, m.connectorName)} hitSlop={10} accessibilityLabel="Remover fonte">
                  <Icon name="trash" size={16} color={colors.textDim} />
                </Pressable>
              }
            />
          ))
        ) : (
          <Card>
            <Text style={font.body}>Nenhuma fonte de dados conectada.</Text>
            <Text style={font.small}>Sem fonte, o Jarvis não mostra números deste negócio — ele não estima vendas, estoque ou faturamento.</Text>
          </Card>
        )}

        <SectionTitle>FONTES DE DADOS</SectionTitle>
        {spaceId === "sir_alfred" && !hasHub ? (
          <Card style={{ gap: space(2) }}>
            <Text style={[font.body, { fontWeight: "700" }]}>Sir Alfred Team Hub</Text>
            <Text style={font.small}>Faturamento, serviços, ticket médio, ranking da equipe, venda de produtos e avaliações — com a sua autorização no próprio Hub (somente leitura).</Text>
            <Button title={available.hub ? "Conectar o Hub" : "Hub não configurado no servidor"} icon="link" onPress={doHub} loading={busy === "hub"} disabled={!available.hub} />
          </Card>
        ) : null}

        {form ? (
          <Card style={{ gap: space(2) }}>
            <Text style={[font.body, { fontWeight: "700" }]}>Nova planilha do Google</Text>
            <TextInput style={styles.input} placeholder="Link da planilha (docs.google.com/spreadsheets/d/…)" placeholderTextColor={colors.textFaint} autoCapitalize="none" value={form.link} onChangeText={(link) => setForm({ ...form, link })} />
            <TextInput style={styles.input} placeholder="Nome (ex.: Vendas da loja)" placeholderTextColor={colors.textFaint} value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
            <TextInput style={styles.input} placeholder="Aba e intervalo (opcional, ex.: Vendas!A1:H500)" placeholderTextColor={colors.textFaint} autoCapitalize="none" value={form.range} onChangeText={(range) => setForm({ ...form, range })} />
            <Text style={font.small}>O que a planilha contém?</Text>
            <View style={styles.chips}>
              {SHEET_DATASETS.map((d) => (
                <Pressable key={d} onPress={() => setForm({ ...form, dataset: d })} style={[styles.chip, form.dataset === d && styles.chipActive]}>
                  <Text style={[font.small, { color: form.dataset === d ? colors.bg : colors.text }]}>{SHEET_DATASET_LABELS[d]}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={font.small}>A primeira linha deve ter os títulos das colunas (ex.: Data, Produto, Quantidade, Valor, Estoque mínimo, Status). O Jarvis só lê; nunca altera a planilha.</Text>
            <View style={{ flexDirection: "row", gap: space(2) }}>
              <Button title="Cancelar" variant="ghost" onPress={() => setForm(null)} style={{ flex: 1 }} />
              <Button title="Conectar" onPress={addSheet} loading={busy === "sheet"} disabled={form.link.trim().length < 10} style={{ flex: 1 }} />
            </View>
          </Card>
        ) : (
          <Button
            title={available.sheets ? "Adicionar planilha do Google" : "Google não configurado no servidor"}
            variant="ghost"
            icon="tablecells.badge.ellipsis"
            disabled={!available.sheets}
            onPress={() => setForm({ name: "", link: "", range: "", dataset: SUGGESTED[spaceId] ?? "tabela" })}
          />
        )}

        <SectionTitle>RELATÓRIOS</SectionTitle>
        <View style={styles.chips}>
          <Pressable onPress={() => generate("relatorio_negocios")} style={styles.chip} disabled={!!busy}>
            <Text style={[font.small, { color: colors.cyan }]}>{busy === "relatorio_negocios" ? "Gerando…" : "Gerar relatório"}</Text>
          </Pressable>
          <Pressable onPress={() => generate("pendencias")} style={styles.chip} disabled={!!busy}>
            <Text style={[font.small, { color: colors.cyan }]}>{busy === "pendencias" ? "Gerando…" : "Pendências"}</Text>
          </Pressable>
          {overview?.connectors.some((c) => (c.config as { dataset?: string }).dataset === "estoque") ? (
            <Pressable onPress={() => generate("alerta_estoque")} style={styles.chip} disabled={!!busy}>
              <Text style={[font.small, { color: colors.cyan }]}>{busy === "alerta_estoque" ? "Gerando…" : "Estoque"}</Text>
            </Pressable>
          ) : null}
        </View>
        {reports.map((r) => (
          <Pressable key={r.id} onPress={() => router.push({ pathname: "/report/[id]", params: { id: r.id } })}>
            <Card style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
              <Icon name="doc.text.fill" size={18} />
              <View style={{ flex: 1 }}>
                <Text style={font.body} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={font.small}>{relativeTime(r.createdAt)}</Text>
              </View>
            </Card>
          </Pressable>
        ))}

        <Text style={[font.small, { marginTop: space(2) }]}>
          {overview ? `${overview.openTasks} tarefa(s) abertas e ${overview.memories} memória(s) neste espaço.` : ""}
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
    paddingHorizontal: space(3),
    paddingVertical: space(2.5),
    color: colors.text,
    fontSize: 15,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  chip: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) },
  chipActive: { backgroundColor: colors.cyan, borderColor: colors.cyan },
});
