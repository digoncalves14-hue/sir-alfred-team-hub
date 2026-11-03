import {
  AUTOMATION_KINDS,
  AUTOMATION_LABELS,
  SPACE_LABELS,
  type Automation,
  type AutomationKind,
  type Report,
  type SpaceOverview,
} from "@jarvis/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { KpiTile, SPACE_ICONS, WEEKDAYS } from "@/components/business";
import { Button, Card, Empty, ErrorBanner, Icon, Pill, Screen, SectionTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { relativeTime } from "@/logic/format";
import { colors, font, radius, space } from "@/theme";

/** Padrões sugeridos ao criar cada automação (o usuário pode mudar depois). */
const DEFAULTS: Record<AutomationKind, { weekday: number | null; runTime: string }> = {
  relatorio_negocios: { weekday: 1, runTime: "08:00" },
  pendencias: { weekday: 1, runTime: "07:30" },
  tarefas_atrasadas: { weekday: null, runTime: "09:00" },
  alerta_estoque: { weekday: null, runTime: "09:00" },
};
const TIMES = ["07:00", "08:00", "09:00", "12:00", "18:00"];

function schedule(a: Automation) {
  return `${a.weekday === null ? "todos os dias" : `toda ${WEEKDAYS[a.weekday]}`}, ${a.runTime}`;
}

export default function Business() {
  const [spaces, setSpaces] = useState<SpaceOverview[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const [ov, au, rp] = await Promise.all([api.businessOverview(undefined, refresh), api.automations(), api.reports()]);
      setSpaces(ov.spaces);
      setAutomations(au.automations);
      setReports(rp.reports.slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar os negócios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toggle = async (a: Automation, enabled: boolean) => {
    setAutomations((list) => list.map((x) => (x.id === a.id ? { ...x, enabled } : x)));
    try {
      await api.updateAutomation(a.id, { enabled });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
      void load();
    }
  };

  const changeTime = async (a: Automation, runTime: string) => {
    setAutomations((list) => list.map((x) => (x.id === a.id ? { ...x, runTime } : x)));
    await api.updateAutomation(a.id, { runTime }).catch(() => load());
  };

  const add = async (kind: AutomationKind) => {
    setBusy(kind);
    try {
      const { automation } = await api.createAutomation({ kind, space: null, ...DEFAULTS[kind] });
      setAutomations((l) => [...l, automation]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar.");
    } finally {
      setBusy(null);
    }
  };

  const runNow = async (a: Automation) => {
    setBusy(a.id);
    try {
      const { report } = await api.runAutomation(a.id);
      router.push({ pathname: "/report/[id]", params: { id: report.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao executar.");
    } finally {
      setBusy(null);
    }
  };

  const remove = (a: Automation) =>
    Alert.alert("Remover automação?", AUTOMATION_LABELS[a.kind], [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: async () => {
          await api.deleteAutomation(a.id).catch(() => undefined);
          setAutomations((l) => l.filter((x) => x.id !== a.id));
        },
      },
    ]);

  const missing = AUTOMATION_KINDS.filter((k) => !automations.some((a) => a.kind === k));

  return (
    <Screen>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(true)} tintColor={colors.cyan} />} contentContainerStyle={{ paddingBottom: space(12) }}>
        <Text style={font.title}>NEGÓCIOS</Text>
        <Text style={font.small}>Dados reais das fontes conectadas. Puxe para atualizar.</Text>
        {error ? <View style={{ marginTop: space(3) }}><ErrorBanner message={error} onRetry={() => load(true)} /></View> : null}

        <View style={{ gap: space(3), marginTop: space(4) }}>
          {spaces.map((s) => {
            const metrics = s.metrics.filter((m) => !m.error);
            const kpis = metrics.flatMap((m) => m.kpis.filter((k) => k.unit !== "text")).slice(0, 2);
            const alerts = s.metrics.reduce((n, m) => n + m.alerts.length + (m.error ? 1 : 0), 0);
            return (
              <Pressable key={s.space} onPress={() => router.push({ pathname: "/space/[id]", params: { id: s.space } })}>
                <Card style={{ gap: space(3) }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
                    <Icon name={SPACE_ICONS[s.space]} size={22} />
                    <Text style={[font.body, { fontWeight: "700", flex: 1 }]}>{SPACE_LABELS[s.space]}</Text>
                    {alerts ? <Pill label={`${alerts} ALERTA${alerts > 1 ? "S" : ""}`} color={colors.amber} /> : null}
                    <Icon name="chevron.right" size={14} color={colors.textDim} />
                  </View>
                  {s.connectors.length === 0 ? (
                    <Text style={font.small}>Nenhuma fonte de dados conectada · {s.openTasks} tarefa(s) · {s.memories} memória(s)</Text>
                  ) : (
                    <>
                      {kpis.length ? (
                        <View style={styles.row}>
                          {kpis.map((k) => (
                            <KpiTile key={k.key} kpi={k} />
                          ))}
                        </View>
                      ) : null}
                      <Text style={font.small}>
                        {s.connectors.length} fonte(s) · {s.openTasks} tarefa(s) abertas
                      </Text>
                    </>
                  )}
                </Card>
              </Pressable>
            );
          })}
        </View>

        <SectionTitle>AUTOMAÇÕES</SectionTitle>
        <Card style={{ gap: space(3) }}>
          {automations.length === 0 ? <Text style={font.small}>Nenhuma automação. Elas rodam no servidor e avisam por notificação, mesmo com o app fechado.</Text> : null}
          {automations.map((a) => (
            <View key={a.id} style={{ gap: space(2) }}>
              <Pressable onLongPress={() => remove(a)} style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
                <View style={{ flex: 1 }}>
                  <Text style={font.body}>{AUTOMATION_LABELS[a.kind]}</Text>
                  <Text style={font.small}>
                    {schedule(a)}
                    {a.space ? ` · ${SPACE_LABELS[a.space]}` : ""}
                    {a.lastRunAt ? ` · última ${relativeTime(a.lastRunAt)}` : ""}
                  </Text>
                </View>
                <Switch value={a.enabled} onValueChange={(v) => toggle(a, v)} trackColor={{ true: colors.cyan }} />
              </Pressable>
              <View style={styles.chips}>
                {TIMES.map((t) => (
                  <Pressable key={t} onPress={() => changeTime(a, t)} style={[styles.chip, a.runTime === t && styles.chipActive]}>
                    <Text style={[font.small, { color: a.runTime === t ? colors.bg : colors.text }]}>{t}</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => runNow(a)} style={styles.chip} disabled={busy === a.id}>
                  <Text style={[font.small, { color: colors.cyan }]}>{busy === a.id ? "Gerando…" : "Rodar agora"}</Text>
                </Pressable>
              </View>
            </View>
          ))}
          {missing.map((k) => (
            <Button key={k} title={`Adicionar: ${AUTOMATION_LABELS[k]}`} variant="ghost" icon="plus" onPress={() => add(k)} loading={busy === k} />
          ))}
          <Text style={font.small}>Segure uma automação para removê-la. Alertas diários só notificam quando há algo a reportar.</Text>
        </Card>

        <SectionTitle>RELATÓRIOS</SectionTitle>
        {reports.length === 0 ? (
          <Empty title="Nenhum relatório ainda." subtitle='Use "Rodar agora" ou peça: "Jarvis, gere o relatório da Black Bear".' />
        ) : (
          <View style={{ gap: space(2) }}>
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
                  <Icon name="chevron.right" size={14} color={colors.textDim} />
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space(2) },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  chip: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) },
  chipActive: { backgroundColor: colors.cyan, borderColor: colors.cyan },
});
