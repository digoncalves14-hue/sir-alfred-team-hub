import type { ChatMessage } from "@jarvis/shared";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import { MessageBubble } from "@/components/chat";
import { ErrorBanner, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, space } from "@/theme";

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [title, setTitle] = useState("Conversa");
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .messages(id)
      .then((r) => {
        setTitle(r.conversation.title);
        setMessages(r.messages);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar."));
  }, [id]);

  return (
    <Screen top={false}>
      <Stack.Screen options={{ title }} />
      {error ? <ErrorBanner message={error} /> : null}
      {!messages && !error ? <ActivityIndicator color={colors.cyan} style={{ marginTop: space(10) }} /> : null}
      <FlatList
        data={messages ?? []}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingVertical: space(3) }}
        renderItem={({ item }) => <MessageBubble message={item} />}
        ListFooterComponent={<View style={{ height: space(10) }} />}
      />
    </Screen>
  );
}
