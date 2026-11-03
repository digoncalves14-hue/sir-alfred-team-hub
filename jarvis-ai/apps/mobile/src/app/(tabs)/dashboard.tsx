import { SPACES, SPACE_LABELS, type AuditEntry, type Memory, type Space, type UsageSummary } from "@jarvis/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Empty, ErrorBanner, Icon, Pill, Screen, SectionTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { formatUsd, relativeTime } from "@/logic/format";
import { colors, font, radius, space } from "@/theme";

const SPACE_ICONS: Record<Space, "person.fill" | "scissors" | "shippingbox.fill" | "desktopcomputer" | "teddybear.fill" | "graduationcap.fill"> = {
  pessoal: "person.fill",
  sir_alfred: "scissors",
  black_bear: "shippingbox.fill",
  barton: "desktopcomputer",
  alfie_fred: "teddybear.fill",
  educacao: "graduationcap.fill",
};

const SPACE_SCOPE: Record<Space, string> = {
  pessoal: "Rotina, preferências e decisões pessoais",
  sir_alfred: "Operação, agenda, equipe e indicadores",
  black_bear: "Produtos, estoque, vendas e e-commerce",
  barton: "Software de gestão para barbearias",
  alfie_fred: "Linha infantil, produtos e parcerias",
  educacao: "Genesis Barber, cursos e mentorias CODE S.O.S.",
};

export default function Dashboard() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, a, m, p] = await Promise.all([api.usage(), api.audit(), api.memories(), api.pendingActions()]);
      setUsage(u);
      setAudit(a.entries.slice(0, 6));
      setMemories(m.memories);
      setPendingCount(p.actions.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar o painel.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const pct = usage && usage.dailyLimitUsd > 0 ? Math.min(1, usage.today.costUsd / usage.dailyLimitUsd) : 0;
  const countBySpace = (s: Space) => memories.filter((m) => m.space === s).length;

  return (
    <Screen>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.cyan} />} contentContainerStyle={{ paddingBottom: space(10) }}>
        <Text style={font.title}>PAINEL</Text>
        <Text style={[font.small, { textTransform: "capitalize" }]}>{today}</Text>
        {error ? <View style={{ marginTop: space(3) }}><ErrorBanner message={error} onRetry={load} /></View> : null}

        <View style={styles.row}>
          <Card style={styles.stat}>
            <Text style={font.mono}>MEMÓRIAS</Text>
            <Text style={styles.big}>{memories.length}</Text>
          </Card>
          <Card style={[styles.stat, pendingCount > 0 && { borderColor: colors.amber }]}>
            <Text style={font.mono}>PENDENTES</Text>
            <Text style={[styles.big, pendingCount > 0 && { color: colors.amber }]}>{pendingCount}</Text>
          </Card>
          <Card style={styles.stat}>
            <Text style={font.mono}>HOJE</Text>
            <Text style={styles.big}>{usage?.today.requests ?? "–"}</Text>
            <Text style={font.small}>conversas</Text>
          </Card>
        </View>

        <SectionTitle>CONSUMO DE IA</SectionTitle>
        <Card style={{ gap: space(2) }}>
          {usage ? (
            <>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={font.body}>Hoje: {formatUsd(usage.today.costUsd)}</Text>
                <Text style={font.small}>limite {formatUsd(usage.dailyLimitUsd)}</Text>
              </View>
              <View style={styles.barBg}>
                <View style={[styles.barFg, { width: `${pct * 100}%`, backgroundColor: pct > 0.85 ? colors.red : pct > 0.6 ? colors.amber : colors.cyan }]} />
              </View>
              <Text style={font.small}>
                30 dias: {formatUsd(usage.last30Days.costUsd)} em {usage.last30Days.requests} requisições · modelo {usage.model}
              </Text>
              <Text style={font.small}>Valores estimados a partir dos tokens; a fatura oficial é a do provedor.</Text>
            </>
          ) : (
            <Text style={font.small}>Carregando…</Text>
          )}
        </Card>

        <SectionTitle>ESPAÇOS</SectionTitle>
        <View style={styles.grid}>
          {SPACES.map((s) => (
            <Card key={s} style={styles.spaceCard}>
              <Icon name={SPACE_ICONS[s]} size={22} />
              <Text style={[font.body, { fontWeight: "700" }]}>{SPACE_LABELS[s]}</Text>
              <Text style={font.small} numberOfLines={2}>
                {SPACE_SCOPE[s]}
              </Text>
              <Text style={font.small}>{countBySpace(s)} memória(s)</Text>
              {s !== "pessoal" ? <Pill label="SEM INTEGRAÇÃO" color={colors.textDim} /> : null}
            </Card>
          ))}
        </View>
        <Text style={[font.small, { marginTop: space(2) }]}>
          Os espaços empresariais organizam memórias e decisões. Dados reais (vendas, estoque, agenda) só aparecerão quando os conectores autorizados forem configurados (Fase 4).
        </Text>

        <SectionTitle>ÚLTIMAS AÇÕES</SectionTitle>
        {audit.length === 0 ? (
          <Empty title="Nenhuma ação registrada." />
        ) : (
          <View style={{ gap: space(2) }}>
            {audit.map((a) => (
              <Card key={a.id} style={{ flexDirection: "row", gap: space(3), alignItems: "center" }}>
                <Icon
                  name={a.status === "executed" || a.status === "confirmed" ? "checkmark.circle.fill" : a.status === "pending" ? "clock.fill" : "xmark.octagon.fill"}
                  color={a.status === "executed" || a.status === "confirmed" ? colors.green : a.status === "pending" ? colors.amber : colors.red}
                  size={18}
                />
                <View style={{ flex: 1 }}>
                  <Text style={font.small}>{a.summary}</Text>
                  <Text style={[font.small, { color: colors.textFaint }]}>
                    {a.tool} · {relativeTime(a.createdAt)}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space(2), marginTop: space(4) },
  stat: { flex: 1, alignItems: "flex-start", gap: 2, padding: space(3) },
  big: { fontSize: 28, fontWeight: "700", color: colors.text },
  barBg: { height: 8, backgroundColor: colors.cyanFaint, borderRadius: radius.pill, overflow: "hidden" },
  barFg: { height: 8, borderRadius: radius.pill },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  spaceCard: { width: "48.5%", gap: space(1.5) },
});
