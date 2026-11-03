import type { ChatMessage, ToolEvent } from "@jarvis/shared";
import { StyleSheet, Text, View } from "react-native";
import { colors, font, radius, space } from "@/theme";
import { Button, Card, Icon } from "./ui";

const STATUS: Record<ToolEvent["status"], { label: string; color: string; icon: "checkmark.circle.fill" | "clock.fill" | "xmark.octagon.fill" | "minus.circle.fill" }> = {
  executed: { label: "EXECUTADO", color: colors.green, icon: "checkmark.circle.fill" },
  pending: { label: "PENDENTE", color: colors.amber, icon: "clock.fill" },
  failed: { label: "FALHOU", color: colors.red, icon: "xmark.octagon.fill" },
  rejected: { label: "CANCELADO", color: colors.textDim, icon: "minus.circle.fill" },
};

/** Feedback visual honesto de cada ferramenta usada. */
export function ToolEventChip({ event }: { event: ToolEvent }) {
  const s = STATUS[event.status];
  return (
    <View style={[styles.chip, { borderColor: s.color }]}>
      <Icon name={s.icon} size={14} color={s.color} />
      <Text style={[font.mono, { color: s.color }]}>{s.label}</Text>
      <Text style={[font.small, { flex: 1, color: colors.text }]} numberOfLines={2}>
        {event.summary}
      </Text>
    </View>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const mine = message.role === "user";
  return (
    <View style={[styles.row, mine ? { justifyContent: "flex-end" } : null]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        {!mine ? <Text style={[font.mono, { marginBottom: 4 }]}>JARVIS</Text> : null}
        <Text style={font.body}>{message.content}</Text>
        {message.toolEvents.length > 0 ? (
          <View style={{ gap: space(2), marginTop: space(2) }}>
            {message.toolEvents.map((e, i) => (
              <ToolEventChip key={i} event={e} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function PendingActionCard({
  summary,
  busy,
  onConfirm,
  onReject,
}: {
  summary: string;
  busy?: boolean;
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <Card style={{ borderColor: colors.amber, gap: space(3) }}>
      <View style={{ flexDirection: "row", gap: space(2), alignItems: "center" }}>
        <Icon name="hand.raised.fill" color={colors.amber} />
        <Text style={[font.mono, { color: colors.amber }]}>AUTORIZAÇÃO NECESSÁRIA</Text>
      </View>
      <Text style={font.body}>{summary}</Text>
      <Text style={font.small}>Nada será feito sem a sua confirmação.</Text>
      <View style={{ flexDirection: "row", gap: space(3) }}>
        <Button title="Cancelar" variant="ghost" onPress={onReject} disabled={busy} style={{ flex: 1 }} />
        <Button title="Confirmar" onPress={onConfirm} loading={busy} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", marginVertical: space(1.5) },
  bubble: { maxWidth: "88%", borderRadius: radius.md, padding: space(3) },
  mine: { backgroundColor: "rgba(30, 123, 255, 0.22)", borderTopRightRadius: 4 },
  theirs: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderTopLeftRadius: 4 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 6 },
});
