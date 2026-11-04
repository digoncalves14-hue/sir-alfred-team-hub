import {
  MEMORY_CATEGORIES,
  MEMORY_CATEGORY_LABELS,
  SPACES,
  SPACE_LABELS,
  type Memory,
  type MemoryCategory,
  type Space,
} from "@jarvis/shared";
import { useFocusEffect } from "expo-router";
import { shareJson } from "@/lib/export-file";
import { useCallback, useState } from "react";
import { Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Button, Card, Empty, ErrorBanner, Icon, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { relativeTime } from "@/logic/format";
import { colors, font, radius, space } from "@/theme";

type Draft = { id?: string; content: string; category: MemoryCategory; space: Space };

function Chips<T extends string>({ values, labels, value, onChange, allowAll }: { values: readonly T[]; labels: Record<T, string>; value: T | null; onChange: (v: T | null) => void; allowAll?: boolean }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2), paddingVertical: space(1) }}>
      {allowAll ? <Chip label="Todos" active={value === null} onPress={() => onChange(null)} /> : null}
      {values.map((v) => (
        <Chip key={v} label={labels[v]} active={value === v} onPress={() => onChange(v)} />
      ))}
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && { backgroundColor: colors.cyan, borderColor: colors.cyan }]}>
      <Text style={[font.small, { color: active ? colors.bg : colors.text, fontWeight: "600" }]}>{label}</Text>
    </Pressable>
  );
}

export default function MemoryScreen() {
  const [items, setItems] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MemoryCategory | null>(null);
  const [spaceFilter, setSpaceFilter] = useState<Space | null>(null);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mem, me] = await Promise.all([
        api.memories({ q: query || undefined, category: category ?? undefined, space: spaceFilter ?? undefined }),
        api.me(),
      ]);
      setItems(mem.memories);
      setMemoryEnabled(me.profile.memoryEnabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar memórias.");
    } finally {
      setLoading(false);
    }
  }, [query, category, spaceFilter]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toggleMemory = async (enabled: boolean) => {
    setMemoryEnabled(enabled);
    try {
      await api.updateSettings({ memoryEnabled: enabled });
    } catch (e) {
      setMemoryEnabled(!enabled);
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    }
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      if (draft.id) await api.updateMemory(draft.id, { content: draft.content, category: draft.category, space: draft.space });
      else await api.createMemory({ content: draft.content, category: draft.category, space: draft.space });
      setDraft(null);
      await load();
    } catch (e) {
      Alert.alert("Não foi possível salvar", e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setSaving(false);
    }
  };

  const remove = (m: Memory) =>
    Alert.alert("Apagar memória?", `"${m.content.slice(0, 120)}"\n\nO Jarvis deixará de lembrar disso.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteMemory(m.id);
            setItems((prev) => prev.filter((x) => x.id !== m.id));
            setDraft(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao apagar.");
          }
        },
      },
    ]);

  const exportAll = async () => {
    setExporting(true);
    try {
      const json = await api.exportData();
      await shareJson(`jarvis-export-${new Date().toISOString().slice(0, 10)}.json`, json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao exportar.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={font.title}>MEMÓRIA</Text>
        <Pressable onPress={() => setDraft({ content: "", category: "outro", space: "pessoal" })} accessibilityLabel="Nova memória">
          <Icon name="plus.circle.fill" size={28} />
        </Pressable>
      </View>

      <Card style={{ marginTop: space(3), flexDirection: "row", alignItems: "center", gap: space(3) }}>
        <View style={{ flex: 1 }}>
          <Text style={font.body}>Armazenar memórias</Text>
          <Text style={font.small}>{memoryEnabled ? "O Jarvis pode guardar decisões e preferências." : "Desativado: nada novo será salvo."}</Text>
        </View>
        <Switch value={memoryEnabled} onValueChange={toggleMemory} trackColor={{ true: colors.cyan }} />
      </Card>

      <TextInput
        style={styles.search}
        placeholder="Buscar na memória…"
        placeholderTextColor={colors.textFaint}
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={load}
        returnKeyType="search"
      />
      <Chips values={MEMORY_CATEGORIES} labels={MEMORY_CATEGORY_LABELS} value={category} onChange={setCategory} allowAll />
      <Chips values={SPACES} labels={SPACE_LABELS} value={spaceFilter} onChange={setSpaceFilter} allowAll />

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      <FlatList
        style={{ flex: 1, marginTop: space(2) }}
        data={items}
        keyExtractor={(m) => m.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.cyan} />}
        ItemSeparatorComponent={() => <View style={{ height: space(2) }} />}
        ListEmptyComponent={loading ? undefined : <Empty title="Nenhuma memória encontrada." subtitle='Diga, por exemplo: "Jarvis, lembre que prefiro reuniões pela manhã."' />}
        renderItem={({ item }) => (
          <Pressable onPress={() => setDraft({ id: item.id, content: item.content, category: item.category, space: item.space })}>
            <Card>
              <Text style={font.body}>{item.content}</Text>
              <Text style={[font.small, { marginTop: space(1) }]}>
                {MEMORY_CATEGORY_LABELS[item.category]} · {SPACE_LABELS[item.space]} · {item.source === "assistant" ? "salva pelo Jarvis" : "salva por você"} · {relativeTime(item.updatedAt)}
              </Text>
            </Card>
          </Pressable>
        )}
        ListFooterComponent={
          <Button title="Exportar meus dados (JSON)" icon="square.and.arrow.up" variant="ghost" onPress={exportAll} loading={exporting} style={{ marginVertical: space(4) }} />
        }
      />

      <Modal visible={!!draft} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDraft(null)}>
        {draft ? (
          <View style={styles.modal}>
            <Text style={font.title}>{draft.id ? "Corrigir memória" : "Nova memória"}</Text>
            <TextInput
              style={[styles.search, { minHeight: 120, textAlignVertical: "top" }]}
              multiline
              value={draft.content}
              onChangeText={(content) => setDraft({ ...draft, content })}
              placeholder="O que o Jarvis deve lembrar?"
              placeholderTextColor={colors.textFaint}
            />
            <Text style={font.heading}>Categoria</Text>
            <Chips values={MEMORY_CATEGORIES} labels={MEMORY_CATEGORY_LABELS} value={draft.category} onChange={(c) => c && setDraft({ ...draft, category: c })} />
            <Text style={font.heading}>Espaço</Text>
            <Chips values={SPACES} labels={SPACE_LABELS} value={draft.space} onChange={(s) => s && setDraft({ ...draft, space: s })} />
            <Text style={font.small}>Não guarde senhas, documentos, dados bancários ou de saúde — o servidor bloqueia esse tipo de conteúdo.</Text>
            <View style={{ flexDirection: "row", gap: space(3), marginTop: space(2) }}>
              <Button title="Cancelar" variant="ghost" onPress={() => setDraft(null)} style={{ flex: 1 }} />
              <Button title="Salvar" onPress={save} loading={saving} disabled={draft.content.trim().length < 2} style={{ flex: 1 }} />
            </View>
            {draft.id ? (
              <Button
                title="Apagar memória"
                variant="danger"
                icon="trash"
                onPress={() => {
                  const m = items.find((x) => x.id === draft.id);
                  if (m) remove(m);
                }}
              />
            ) : null}
          </View>
        ) : null}
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    color: colors.text,
    fontSize: 16,
    marginTop: space(3),
  },
  chip: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) },
  modal: { flex: 1, backgroundColor: colors.bgElevated, padding: space(5), gap: space(3) },
});
