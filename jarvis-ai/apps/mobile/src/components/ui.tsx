import { LinearGradient } from "expo-linear-gradient";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ColorValue, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, space } from "@/theme";

export function Screen({ children, padded = true, top = true }: { children: ReactNode; padded?: boolean; top?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <LinearGradient colors={["#061226", colors.bg, "#020409"]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <View style={[{ flex: 1, paddingTop: top ? insets.top + space(2) : 0 }, padded && { paddingHorizontal: space(4) }]}>{children}</View>
    </View>
  );
}

export function Icon({ name, size = 20, color = colors.cyan }: { name: SymbolViewProps["name"]; size?: number; color?: ColorValue }) {
  return <SymbolView name={name} size={size} tintColor={color} fallback={<View style={{ width: size, height: size }} />} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={font.heading}>{children}</Text>
      {right}
    </View>
  );
}

type Variant = "primary" | "ghost" | "danger";
export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: SymbolViewProps["name"];
  style?: StyleProp<ViewStyle>;
}) {
  const tint = variant === "danger" ? colors.red : variant === "ghost" ? colors.cyan : colors.bg;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && { backgroundColor: colors.cyan },
        variant !== "primary" && { borderWidth: 1, borderColor: variant === "danger" ? colors.red : colors.cardBorder },
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={tint} /> : icon ? <Icon name={icon} size={16} color={tint} /> : null}
      <Text style={[styles.buttonText, { color: tint }]}>{title}</Text>
    </Pressable>
  );
}

export function Pill({ label, color = colors.cyan }: { label: string; color?: string }) {
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[font.mono, { color }]}>{label}</Text>
    </View>
  );
}

export function Empty({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: space(10), gap: space(2) }}>
      <Text style={[font.body, { color: colors.textDim }]}>{title}</Text>
      {subtitle ? <Text style={[font.small, { textAlign: "center" }]}>{subtitle}</Text> : null}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: colors.red, flexDirection: "row", alignItems: "center", gap: space(3) }}>
      <Icon name="exclamationmark.triangle.fill" color={colors.red} />
      <Text style={[font.small, { color: colors.text, flex: 1 }]}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button">
          <Text style={[font.small, { color: colors.cyan }]}>Tentar</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    padding: space(4),
  },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space(5), marginBottom: space(2) },
  button: {
    flexDirection: "row",
    gap: space(2),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingVertical: space(3),
    paddingHorizontal: space(5),
  },
  buttonText: { fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
