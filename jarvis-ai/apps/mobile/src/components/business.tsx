import type { ConnectorMetrics, Kpi, Space } from "@jarvis/shared";
import { StyleSheet, Text, View } from "react-native";
import { colors, font, radius, space } from "@/theme";
import { Card, Icon } from "./ui";

export const SPACE_ICONS: Record<Space, "person.fill" | "scissors" | "shippingbox.fill" | "desktopcomputer" | "teddybear.fill" | "graduationcap.fill"> = {
  pessoal: "person.fill",
  sir_alfred: "scissors",
  black_bear: "shippingbox.fill",
  barton: "desktopcomputer",
  alfie_fred: "teddybear.fill",
  educacao: "graduationcap.fill",
};

export const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function kpiValue(k: Kpi): string {
  if (k.unit === "text") return k.text ?? "—";
  if (k.value === null) return k.text ?? "—";
  if (k.unit === "brl") return k.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: k.value >= 1000 ? 0 : 2 });
  if (k.unit === "pct") return `${k.value}%`;
  if (k.unit === "stars") return `${k.value.toFixed(1)} ★`;
  return k.value.toLocaleString("pt-BR");
}

export function KpiTile({ kpi }: { kpi: Kpi }) {
  const change = kpi.changePct;
  return (
    <View style={styles.tile}>
      <Text style={font.mono} numberOfLines={1}>
        {kpi.label.toUpperCase()}
      </Text>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {kpiValue(kpi)}
      </Text>
      {change !== undefined && change !== null ? (
        <Text style={[font.small, { color: change >= 0 ? colors.green : colors.red }]}>
          {change >= 0 ? "▲" : "▼"} {Math.abs(change).toLocaleString("pt-BR")}% vs anterior
        </Text>
      ) : kpi.text && kpi.unit !== "text" ? (
        <Text style={font.small} numberOfLines={1}>
          {kpi.text}
        </Text>
      ) : null}
    </View>
  );
}

export function MetricsCard({ m, actions }: { m: ConnectorMetrics; actions?: React.ReactNode }) {
  return (
    <Card style={{ gap: space(3), borderColor: m.error ? colors.red : m.alerts.length ? colors.amber : colors.cardBorder }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
        <Icon name={m.type === "sir_alfred_hub" ? "person.3.fill" : "tablecells"} size={18} />
        <View style={{ flex: 1 }}>
          <Text style={[font.body, { fontWeight: "700" }]}>{m.connectorName}</Text>
          {m.period ? <Text style={font.small}>{m.period}</Text> : null}
        </View>
        {actions}
      </View>
      {m.error ? <Text style={[font.small, { color: colors.red }]}>{m.error}</Text> : null}
      {m.kpis.length ? (
        <View style={styles.grid}>
          {m.kpis.map((k) => (
            <KpiTile key={k.key} kpi={k} />
          ))}
        </View>
      ) : null}
      {m.highlights.length ? (
        <View style={{ gap: 2 }}>
          {m.highlights.map((h) => (
            <Text key={h} style={[font.small, { color: colors.text }]}>
              • {h}
            </Text>
          ))}
        </View>
      ) : null}
      {m.alerts.length ? (
        <View style={{ gap: 2 }}>
          {m.alerts.map((a) => (
            <Text key={a} style={[font.small, { color: colors.amber }]}>
              ⚠ {a}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  tile: { width: "48.5%", backgroundColor: colors.bgElevated, borderRadius: radius.sm, padding: space(3), gap: 2 },
  value: { fontSize: 22, fontWeight: "700", color: colors.text },
});
