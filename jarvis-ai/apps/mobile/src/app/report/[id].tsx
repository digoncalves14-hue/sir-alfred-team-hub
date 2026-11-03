import type { Report } from "@jarvis/shared";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Share, Text, View } from "react-native";
import { Button, ErrorBanner, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font, space } from "@/theme";

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .report(id)
      .then((r) => setReport(r.report))
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar."));
  }, [id]);

  const remove = () =>
    Alert.alert("Apagar relatório?", undefined, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          await api.deleteReport(id).catch(() => undefined);
          router.back();
        },
      },
    ]);

  return (
    <Screen top={false}>
      <Stack.Screen options={{ title: report?.title ?? "Relatório" }} />
      {error ? <ErrorBanner message={error} /> : null}
      {!report && !error ? <ActivityIndicator color={colors.cyan} style={{ marginTop: space(10) }} /> : null}
      {report ? (
        <ScrollView contentContainerStyle={{ paddingVertical: space(4), gap: space(4) }}>
          <Text style={font.small}>{new Date(report.createdAt).toLocaleString("pt-BR")}</Text>
          <Text selectable style={[font.body, { fontFamily: "Menlo", fontSize: 14, lineHeight: 21 }]}>
            {report.body}
          </Text>
          <View style={{ flexDirection: "row", gap: space(3) }}>
            <Button title="Compartilhar" icon="square.and.arrow.up" variant="ghost" onPress={() => Share.share({ message: `${report.title}\n\n${report.body}` })} style={{ flex: 1 }} />
            <Button title="Apagar" variant="danger" onPress={remove} style={{ flex: 1 }} />
          </View>
        </ScrollView>
      ) : null}
    </Screen>
  );
}
