import { Tabs } from "expo-router";
import { Icon } from "@/components/ui";
import { colors } from "@/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.cyan,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { backgroundColor: "#040A16", borderTopColor: colors.cardBorder },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Jarvis", tabBarIcon: ({ color }) => <Icon name="waveform.circle.fill" color={color} size={24} /> }} />
      <Tabs.Screen name="dashboard" options={{ title: "Hoje", tabBarIcon: ({ color }) => <Icon name="sun.max.fill" color={color} size={22} /> }} />
      <Tabs.Screen name="history" options={{ title: "Histórico", tabBarIcon: ({ color }) => <Icon name="clock.arrow.circlepath" color={color} size={22} /> }} />
      <Tabs.Screen name="memory" options={{ title: "Memória", tabBarIcon: ({ color }) => <Icon name="brain.head.profile" color={color} size={22} /> }} />
      <Tabs.Screen name="settings" options={{ title: "Ajustes", tabBarIcon: ({ color }) => <Icon name="gearshape.fill" color={color} size={22} /> }} />
    </Tabs>
  );
}
