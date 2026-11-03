import type { Routine } from "@jarvis/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { WEEKDAYS } from "@/components/business";
import { Button, Card, Empty, ErrorBanner, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font, radius, space } from "@/theme";

type Draft = { id?: string; name: string; triggerPhrase: string; instructions: string; weekday: number | null; runTime: string | null; scheduleEnabled: boolean };
const EMPTY: Draft = { name: "", triggerPhrase: "", instructions: "", weekday: null, runTime: null, scheduleEnabled: false };
const TIMES = ["07:00", "08:00", "09:00", "12:00", "18:00", "19:00"];
const EXAMPLES: Draft[] = [
  {
    name: "Abertura da barbearia",
    triggerPhrase: "abertura da barbearia",
    instructions: "1) Diga o resumo do dia. 2) Mostre os indicadores do Sir Alfred. 3) Liste as tarefas atrasadas do espaço Sir Alfred.",
    weekday: null,
    runTime: "08:00",
    scheduleEnabled: false,
  },
  {
    name: "Fechamento do dia",
    triggerPhrase: "fechamento do dia",
    instructions: "1) Liste as tarefas que continuam abertas. 2) Verifique e-mails importantes não lidos. 3) Me lembre dos compromissos de amanhã.",
    weekday: null,
    runTime: "19:00",
    scheduleEnabled: false,
  },
];

export default function Routines() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRoutines((await api.routines()).routines);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const payload = { ...draft, runTime: draft.scheduleEnabled ? (draft.runTime ?? "08:00") : draft.runTime };
      if (draft.id) await api.updateRoutine(draft.id, payload);
      else await api.createRoutine(payload);
      setDraft(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const remove = (r: Routine) =>
    Alert.alert("Apagar rotina?", r.name, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          await api.deleteRoutine(r.id).catch(() => undefined);
          setDraft(null);
          await load();
        },
      },
    ]);

  const run = (r: Routine) => router.navigate({ pathname: "/", params: { rotina: r.id, n: String(Date.now()) } });

  return (
    <Screen top={false}>
      <ScrollView contentContainerStyle={{ paddingVertical: space(3), gap: space(3), paddingBottom: space(12) }} keyboardShouldPersistTaps="handled">
        <Text style={font.small}>
          Diga a frase de ativação (ex.: “Jarvis, abertura da barbearia”) e o Jarvis executa as etapas na ordem. Ações que enviam, apagam ou alteram algo continuam pedindo confirmação.
        </Text>
        {error ? <ErrorBanner message={error} /> : null}

        {draft ? (
          <Card style={{ gap: space(2) }}>
            <TextInput style={styles.input} placeholder="Nome" placeholderTextColor={colors.textFaint} value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} />
            <TextInput
              style={styles.input}
              placeholder="Frase de ativação (ex.: abertura da barbearia)"
              placeholderTextColor={colors.textFaint}
              value={draft.triggerPhrase}
              onChangeText={(triggerPhrase) => setDraft({ ...draft, triggerPhrase })}
            />
            <TextInput
              style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
              multiline
              placeholder="Etapas, em ordem: 1) … 2) … 3) …"
              placeholderTextColor={colors.textFaint}
              value={draft.instructions}
              onChangeText={(instructions) => setDraft({ ...draft, instructions })}
            />
            <View style={styles.row}>
              <Text style={[font.body, { flex: 1 }]}>Lembrar em horário fixo</Text>
              <Switch value={draft.scheduleEnabled} onValueChange={(v) => setDraft({ ...draft, scheduleEnabled: v, runTime: draft.runTime ?? "08:00" })} trackColor={{ true: colors.cyan }} />
            </View>
            {draft.scheduleEnabled ? (
              <>
                <View style={styles.chips}>
                  <Chip label="Todo dia" active={draft.weekday === null} onPress={() => setDraft({ ...draft, weekday: null })} />
                  {WEEKDAYS.map((d, i) => (
                    <Chip key={d} label={d.slice(0, 3)} active={draft.weekday === i} onPress={() => setDraft({ ...draft, weekday: i })} />
                  ))}
                </View>
                <View style={styles.chips}>
                  {TIMES.map((t) => (
                    <Chip key={t} label={t} active={draft.runTime === t} onPress={() => setDraft({ ...draft, runTime: t })} />
                  ))}
                </View>
                <Text style={font.small}>No horário, chega uma notificação; ao tocar, o Jarvis executa a rotina com você no app.</Text>
              </>
            ) : null}
            <View style={{ flexDirection: "row", gap: space(2) }}>
              <Button title="Cancelar" variant="ghost" onPress={() => setDraft(null)} style={{ flex: 1 }} />
              <Button
                title="Salvar"
                onPress={save}
                loading={saving}
                disabled={!draft.name.trim() || draft.triggerPhrase.trim().length < 3 || draft.instructions.trim().length < 5}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        ) : (
          <Button title="Nova rotina" icon="plus" onPress={() => setDraft(EMPTY)} />
        )}

        {routines.length === 0 && !draft ? (
          <>
            <Empty title="Nenhuma rotina ainda." subtitle="Comece por um exemplo:" />
            {EXAMPLES.map((ex) => (
              <Button key={ex.name} title={`Usar: ${ex.name}`} variant="ghost" onPress={() => setDraft(ex)} />
            ))}
          </>
        ) : null}

        {routines.map((r) => (
          <Pressable key={r.id} onPress={() => setDraft({ id: r.id, name: r.name, triggerPhrase: r.triggerPhrase, instructions: r.instructions, weekday: r.weekday, runTime: r.runTime, scheduleEnabled: r.scheduleEnabled })} onLongPress={() => remove(r)}>
            <Card style={{ gap: space(2) }}>
              <View style={styles.row}>
                <Text style={[font.body, { fontWeight: "700", flex: 1 }]}>{r.name}</Text>
                <Switch value={r.enabled} onValueChange={async (enabled) => { await api.updateRoutine(r.id, { enabled }).catch(() => undefined); await load(); }} trackColor={{ true: colors.cyan }} />
              </View>
              <Text style={font.mono}>“JARVIS, {r.triggerPhrase.toUpperCase()}”</Text>
              <Text style={font.small} numberOfLines={3}>
                {r.instructions}
              </Text>
              {r.scheduleEnabled && r.runTime ? <Text style={font.small}>⏰ {r.weekday === null ? "todo dia" : `toda ${WEEKDAYS[r.weekday]}`}, {r.runTime}</Text> : null}
              <Button title="Executar agora" variant="ghost" icon="play.fill" onPress={() => run(r)} />
            </Card>
          </Pressable>
        ))}
        <Text style={font.small}>Toque para editar; segure para apagar.</Text>
      </ScrollView>
    </Screen>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[font.small, { color: active ? colors.bg : colors.text }]}>{label}</Text>
    </Pressable>
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
  row: { flexDirection: "row", alignItems: "center", gap: space(2) },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  chip: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) },
  chipActive: { backgroundColor: colors.cyan, borderColor: colors.cyan },
});
