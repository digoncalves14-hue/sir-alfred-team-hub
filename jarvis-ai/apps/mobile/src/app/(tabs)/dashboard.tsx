import { SPACES, SPACE_LABELS, type AppNotification, type AuditEntry, type Memory, type Space, type Task, type Today, type UsageSummary } from "@jarvis/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, Empty, ErrorBanner, Icon, Pill, Screen, SectionTitle } from "@/components/ui";
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
  const [today, setToday] = useState<Today | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [newTask, setNewTask] = useState("");
  const [forToday, setForToday] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, a, m, p, t, n] = await Promise.all([api.usage(), api.audit(), api.memories(), api.pendingActions(), api.today(), api.notifications()]);
      setToday(t);
      setNotifications(n.notifications.slice(0, 5));
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

  const todayLabel = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  const addTask = async () => {
    const title = newTask.trim();
    if (!title) return;
    setNewTask("");
    try {
      await api.createTask({ title, dueDate: forToday ? today?.date : undefined });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar a tarefa.");
    }
  };

  const complete = async (t: Task) => {
    setToday((prev) => (prev ? { ...prev, tasks: prev.tasks.filter((x) => x.id !== t.id) } : prev));
    try {
      await api.updateTask(t.id, { status: "concluida" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao concluir.");
      await load();
    }
  };

  const removeTask = (t: Task) =>
    Alert.alert("Apagar tarefa?", `"${t.title}"`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteTask(t.id);
            await load();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao apagar.");
          }
        },
      },
    ]);
  const pct = usage && usage.dailyLimitUsd > 0 ? Math.min(1, usage.today.costUsd / usage.dailyLimitUsd) : 0;
  const countBySpace = (s: Space) => memories.filter((m) => m.space === s).length;

  return (
    <Screen>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.cyan} />} contentContainerStyle={{ paddingBottom: space(10) }}>
        <Text style={font.title}>HOJE</Text>
        <Text style={[font.small, { textTransform: "capitalize" }]}>{todayLabel}</Text>
        {error ? <View style={{ marginTop: space(3) }}><ErrorBanner message={error} onRetry={load} /></View> : null}

        <View style={styles.row}>
          <Card style={styles.stat}>
            <Text style={font.mono}>AGENDA</Text>
            <Text style={styles.big}>{today?.calendar.connected ? today.calendar.events.length : "–"}</Text>
            <Text style={font.small}>compromissos</Text>
          </Card>
          <Card style={styles.stat}>
            <Text style={font.mono}>TAREFAS</Text>
            <Text style={styles.big}>{today?.tasks.length ?? "–"}</Text>
            <Text style={font.small}>abertas</Text>
          </Card>
          <Card style={[styles.stat, pendingCount > 0 && { borderColor: colors.amber }]}>
            <Text style={font.mono}>PENDENTES</Text>
            <Text style={[styles.big, pendingCount > 0 && { color: colors.amber }]}>{pendingCount}</Text>
          </Card>
        </View>

        <SectionTitle>AGENDA DE HOJE</SectionTitle>
        {!today ? null : !today.calendar.connected ? (
          <Card style={{ gap: space(3) }}>
            <Text style={font.small}>Conecte o Google Agenda para ver e criar compromissos por voz.</Text>
            <Button title="Conectar em Ajustes" variant="ghost" icon="calendar.badge.plus" onPress={() => router.push("/settings")} />
          </Card>
        ) : today.calendar.error ? (
          <ErrorBanner message={today.calendar.error} onRetry={load} />
        ) : today.calendar.events.length === 0 ? (
          <Empty title="Nenhum compromisso hoje." />
        ) : (
          <View style={{ gap: space(2) }}>
            {today.calendar.events.map((e) => (
              <Pressable key={e.id} onPress={() => e.link && Linking.openURL(e.link)}>
                <Card style={{ flexDirection: "row", gap: space(3), alignItems: "center" }}>
                  <Text style={[font.mono, { width: 52, color: colors.cyan }]}>{e.allDay ? "DIA" : e.start.slice(11, 16)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={font.body}>{e.title}</Text>
                    {e.location ? <Text style={font.small}>{e.location}</Text> : null}
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}

        <SectionTitle>TAREFAS</SectionTitle>
        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            placeholder="Nova tarefa…"
            placeholderTextColor={colors.textFaint}
            value={newTask}
            onChangeText={setNewTask}
            onSubmitEditing={addTask}
            returnKeyType="done"
          />
          <Pressable onPress={() => setForToday(!forToday)} style={[styles.todayChip, forToday && { backgroundColor: colors.cyan }]}>
            <Text style={[font.small, { color: forToday ? colors.bg : colors.text, fontWeight: "600" }]}>Hoje</Text>
          </Pressable>
          <Pressable onPress={addTask} accessibilityLabel="Adicionar tarefa">
            <Icon name="plus.circle.fill" size={30} />
          </Pressable>
        </View>
        {today && today.tasks.length === 0 ? (
          <Empty title="Nenhuma tarefa aberta." subtitle='Ou diga: "Jarvis, me lembre amanhã às 9 de ligar para o contador."' />
        ) : (
          <View style={{ gap: space(2) }}>
            {today?.tasks.map((t) => {
              const overdue = t.dueDate && t.dueDate < today.date;
              return (
                <Pressable key={t.id} onLongPress={() => removeTask(t)}>
                  <Card style={{ flexDirection: "row", gap: space(3), alignItems: "center" }}>
                    <Pressable onPress={() => complete(t)} accessibilityLabel="Concluir tarefa" hitSlop={10}>
                      <Icon name="circle" size={22} color={t.priority === "alta" ? colors.amber : colors.cyan} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <Text style={font.body}>{t.title}</Text>
                      <Text style={[font.small, overdue ? { color: colors.red } : null]}>
                        {[
                          SPACE_LABELS[t.space],
                          t.dueDate ? (overdue ? `atrasada (${t.dueDate})` : t.dueDate === today.date ? "hoje" : t.dueDate) : null,
                          t.remindAt ? `lembrete ${new Date(t.remindAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
        <Text style={[font.small, { marginTop: space(2) }]}>Toque no círculo para concluir; segure para apagar.</Text>

        {today?.email.connected ? (
          <>
            <SectionTitle>E-MAIL</SectionTitle>
            <Card>
              <Text style={font.body}>
                {today.email.error ?? `${today.email.importantUnread ?? 0} e-mail(s) importante(s) não lido(s) nos últimos 7 dias.`}
              </Text>
              <Text style={font.small}>Peça: “Jarvis, resuma meus e-mails importantes.”</Text>
            </Card>
          </>
        ) : null}

        {notifications.length > 0 ? (
          <>
            <SectionTitle>NOTIFICAÇÕES</SectionTitle>
            <View style={{ gap: space(2) }}>
              {notifications.map((n) => (
                <Card key={n.id} style={!n.readAt ? { borderColor: colors.cyanSoft } : undefined}>
                  <Text style={font.mono}>{n.title.toUpperCase()} · {relativeTime(n.createdAt)}</Text>
                  <Text style={[font.small, { color: colors.text, marginTop: 4 }]}>{n.body}</Text>
                </Card>
              ))}
            </View>
          </>
        ) : null}

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
            <Pressable key={s} style={styles.spaceCard} onPress={() => (s === "pessoal" ? router.push("/memory") : router.push({ pathname: "/space/[id]", params: { id: s } }))}>
            <Card style={{ gap: space(1.5), flex: 1 }}>
              <Icon name={SPACE_ICONS[s]} size={22} />
              <Text style={[font.body, { fontWeight: "700" }]}>{SPACE_LABELS[s]}</Text>
              <Text style={font.small} numberOfLines={2}>
                {SPACE_SCOPE[s]}
              </Text>
              <Text style={font.small}>{countBySpace(s)} memória(s)</Text>
            </Card>
            </Pressable>
          ))}
        </View>
        <Text style={[font.small, { marginTop: space(2) }]}>
          Toque num espaço para ver indicadores e conectar fontes de dados (aba Negócios). Sem fonte conectada, nenhum número é exibido.
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
  spaceCard: { width: "48.5%" },
  addRow: { flexDirection: "row", alignItems: "center", gap: space(2), marginBottom: space(2) },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    paddingVertical: space(2.5),
    color: colors.text,
    fontSize: 16,
  },
  todayChip: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) },
});
