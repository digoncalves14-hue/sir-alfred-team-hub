import type { Conversation } from "@jarvis/shared";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { Card, Empty, ErrorBanner, Icon, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { relativeTime } from "@/logic/format";
import { colors, font, space } from "@/theme";

export default function History() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems((await api.conversations()).conversations);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar o histórico.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const remove = (c: Conversation) =>
    Alert.alert("Apagar conversa?", `"${c.title}" e todas as mensagens serão apagadas. Isso não pode ser desfeito.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteConversation(c.id);
            setItems((prev) => prev.filter((x) => x.id !== c.id));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao apagar.");
          }
        },
      },
    ]);

  return (
    <Screen>
      <Text style={[font.title, { marginBottom: space(4) }]}>HISTÓRICO</Text>
      {error ? <ErrorBanner message={error} onRetry={load} /> : null}
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.cyan} />}
        ItemSeparatorComponent={() => <View style={{ height: space(2) }} />}
        ListEmptyComponent={loading ? undefined : <Empty title="Nenhuma conversa ainda." subtitle="Fale com o Jarvis na aba principal." />}
        renderItem={({ item }) => (
          <Link href={{ pathname: "/conversation/[id]", params: { id: item.id } }} asChild>
            <Pressable onLongPress={() => remove(item)}>
              <Card style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
                <Icon name="bubble.left.and.bubble.right.fill" />
                <View style={{ flex: 1 }}>
                  <Text style={font.body} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={font.small}>{relativeTime(item.updatedAt)}</Text>
                </View>
                <Icon name="chevron.right" size={14} color={colors.textDim} />
              </Card>
            </Pressable>
          </Link>
        )}
      />
      <Text style={[font.small, { textAlign: "center", paddingVertical: space(2) }]}>Segure uma conversa para apagá-la.</Text>
    </Screen>
  );
}
