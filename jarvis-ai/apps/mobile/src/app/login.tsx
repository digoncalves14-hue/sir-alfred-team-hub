import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { HoloOrb } from "@/components/HoloOrb";
import { Button, Screen } from "@/components/ui";
import { useAuth } from "@/providers/AuthProvider";
import { colors, font, radius, space } from "@/theme";

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    setMessage(null);
    if (!email.includes("@") || password.length < 8) {
      setMessage("Informe um e-mail válido e uma senha com pelo menos 8 caracteres.");
      return;
    }
    setBusy(true);
    const err = mode === "in" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (err) setMessage(err);
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "center", gap: space(5) }}>
        <View style={{ alignItems: "center", gap: space(3) }}>
          <HoloOrb phase="idle" level={0} size={200} />
          <Text style={font.title}>JARVIS AI</Text>
          <Text style={font.small}>Seu assistente pessoal</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="E-mail"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Senha"
          placeholderTextColor={colors.textFaint}
          secureTextEntry
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          textContentType={mode === "in" ? "password" : "newPassword"}
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
        />
        {message ? <Text style={[font.small, { color: colors.amber, textAlign: "center" }]}>{message}</Text> : null}
        <Button title={mode === "in" ? "Entrar" : "Criar conta"} onPress={submit} loading={busy} />
        <Pressable onPress={() => setMode(mode === "in" ? "up" : "in")} accessibilityRole="button">
          <Text style={[font.small, { textAlign: "center", color: colors.cyan }]}>
            {mode === "in" ? "Primeiro acesso? Criar conta" : "Já tenho conta. Entrar"}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: space(4),
    paddingVertical: space(3.5),
    color: colors.text,
    fontSize: 16,
  },
});
