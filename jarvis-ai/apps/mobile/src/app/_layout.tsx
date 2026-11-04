import "@/lib/web-setup";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { jarvisNative, type PendingIntent } from "../../modules/jarvis-native";
import { AppState, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { HoloOrb } from "@/components/HoloOrb";
import { Button, Screen } from "@/components/ui";
import { missingConfig } from "@/lib/config";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { PrefsProvider, usePrefs } from "@/providers/PrefsProvider";
import { onNotificationTap, registerForPush } from "@/lib/push";
import { colors, font, space } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function LockScreen() {
  const { unlock } = useAuth();
  useEffect(() => {
    unlock().catch(() => undefined);
  }, [unlock]);
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space(6) }}>
        <HoloOrb phase="idle" level={0} size={220} />
        <Text style={font.title}>JARVIS BLOQUEADO</Text>
        <Button title="Desbloquear com Face ID" icon="faceid" onPress={() => unlock()} />
      </View>
    </Screen>
  );
}

function MissingConfig() {
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: space(4) }}>
        <Text style={font.title}>Configuração pendente</Text>
        <Text style={font.body}>Defina estas variáveis em apps/mobile/.env e gere o app novamente:</Text>
        {missingConfig.map((k) => (
          <Text key={k} style={[font.mono, { color: colors.amber }]}>
            {`EXPO_PUBLIC_${k.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()}`}
          </Text>
        ))}
      </View>
    </Screen>
  );
}

function RootNavigator() {
  const { session, loading, locked } = useAuth();
  const { prefs } = usePrefs();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => undefined);
  }, [loading]);

  // Toque numa notificação → abre a tela indicada (jarvis://dashboard → /dashboard).
  useEffect(
    () =>
      onNotificationTap((url) => {
        const path = url.replace(/^jarvis:\/\//, "/");
        router.push((path === "/" ? "/" : path) as never);
      }),
    [],
  );

  // Siri / Atalhos / Botão de Ação → pedidos deixados pelos App Intents (processados após login e desbloqueio).
  const [intent, setIntent] = useState<PendingIntent | null>(() => jarvisNative.consumePendingIntent());
  useEffect(() => {
    const off = jarvisNative.onIntent(setIntent);
    // Garantia extra: ao voltar ao primeiro plano, lê um pedido que possa ter chegado antes.
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") {
        const p = jarvisNative.consumePendingIntent();
        if (p) setIntent(p);
      }
    });
    return () => {
      off();
      sub.remove();
    };
  }, []);
  useEffect(() => {
    if (!intent || !session || locked) return;
    const n = String(Date.now());
    if (intent.action === "listen") router.navigate({ pathname: "/", params: { ouvir: "1", n } });
    else if (intent.action === "ask" && intent.text) router.navigate({ pathname: "/", params: { pergunta: intent.text, n } });
    else router.navigate("/");
    setIntent(null);
  }, [intent, session, locked]);

  // Renova o registro do aparelho para push a cada abertura (tokens podem mudar).
  useEffect(() => {
    if (session && prefs.pushEnabled) registerForPush().catch(() => undefined);
  }, [session, prefs.pushEnabled]);

  if (missingConfig.length > 0) return <MissingConfig />;
  if (loading) return null;
  if (locked) return <LockScreen />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="history" options={{ headerShown: true, title: "Histórico", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.cyan, headerBackTitle: "Voltar" }} />
        <Stack.Screen name="space/[id]" options={{ headerShown: true, title: "Negócio", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.cyan, headerBackTitle: "Voltar" }} />
        <Stack.Screen name="report/[id]" options={{ headerShown: true, title: "Relatório", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.cyan, headerBackTitle: "Voltar" }} />
        <Stack.Screen name="hub-oauth" options={{ headerShown: false }} />
        <Stack.Screen name="google-oauth" options={{ headerShown: false }} />
        <Stack.Screen name="routines" options={{ headerShown: true, title: "Rotinas", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.cyan, headerBackTitle: "Voltar" }} />
        <Stack.Screen
          name="conversation/[id]"
          options={{ headerShown: true, title: "Conversa", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.cyan, headerBackTitle: "Voltar" }}
        />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PrefsProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </AuthProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}
