import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { HoloOrb } from "@/components/HoloOrb";
import { Button, Screen } from "@/components/ui";
import { missingConfig } from "@/lib/config";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { PrefsProvider } from "@/providers/PrefsProvider";
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

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => undefined);
  }, [loading]);

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
