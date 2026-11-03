import type { Health, Profile } from "@jarvis/shared";
import * as LocalAuthentication from "expo-local-authentication";
import type { Voice } from "expo-speech";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Button, Card, ErrorBanner, Pill, Screen, SectionTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { config } from "@/lib/config";
import { useAuth } from "@/providers/AuthProvider";
import { usePrefs } from "@/providers/PrefsProvider";
import { listPortugueseVoices, speak } from "@/voice/tts";
import { colors, font, radius, space } from "@/theme";

function Row({ title, subtitle, value, onChange, disabled }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={font.body}>{title}</Text>
        {subtitle ? <Text style={font.small}>{subtitle}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.cyan }} />
    </View>
  );
}

export default function Settings() {
  const { prefs, setPrefs } = usePrefs();
  const { session, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [limit, setLimit] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api
        .me()
        .then(({ profile: p }) => {
          setProfile(p);
          setOwnerName(p.ownerName);
          setLimit(String(p.dailyCostLimitUsd));
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar o perfil."));
      api.health().then(setHealth).catch(() => setHealth(null));
    }, []),
  );

  useEffect(() => {
    listPortugueseVoices().then(setVoices).catch(() => setVoices([]));
    (async () => {
      const ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
      setBiometricAvailable(ok);
    })();
  }, []);

  const saveProfile = async () => {
    const limitNum = Number(limit.replace(",", "."));
    if (!ownerName.trim()) return setError("Informe como o Jarvis deve chamar você.");
    if (!Number.isFinite(limitNum) || limitNum < 0 || limitNum > 100) return setError("Limite diário deve estar entre 0 e 100 dólares.");
    setSaving(true);
    setError(null);
    try {
      const r = await api.updateSettings({ ownerName: ownerName.trim(), dailyCostLimitUsd: limitNum });
      setProfile(r.profile);
      Alert.alert("Salvo", `O Jarvis vai chamar você de "${r.profile.ownerName}".`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const toggleBiometric = async (v: boolean) => {
    if (v) {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Ativar bloqueio com Face ID" });
      if (!r.success) return;
    }
    setPrefs({ biometricLock: v });
  };

  const testVoice = () =>
    speak(`Olá, ${ownerName || "senhor"}. Esta é a minha voz.`, { voiceIdentifier: prefs.voiceIdentifier, rate: prefs.speechRate, premium: prefs.premiumVoice });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: space(12) }} keyboardShouldPersistTaps="handled">
        <Text style={font.title}>AJUSTES</Text>
        {error ? <View style={{ marginTop: space(3) }}><ErrorBanner message={error} /></View> : null}

        <SectionTitle>IDENTIDADE</SectionTitle>
        <Card style={{ gap: space(3) }}>
          <Text style={font.small}>Como o Jarvis deve chamar você</Text>
          <TextInput style={styles.input} value={ownerName} onChangeText={setOwnerName} placeholder="senhor" placeholderTextColor={colors.textFaint} maxLength={60} />
          <Text style={font.small}>Limite diário de custo de IA (US$)</Text>
          <TextInput style={styles.input} value={limit} onChangeText={setLimit} keyboardType="decimal-pad" placeholder="1.00" placeholderTextColor={colors.textFaint} />
          <Button title="Salvar" onPress={saveProfile} loading={saving} disabled={!profile} />
        </Card>

        <SectionTitle>VOZ</SectionTitle>
        <Card>
          <Row title="Falar respostas" subtitle="Desative para usar só texto" value={prefs.speakReplies} onChange={(v) => setPrefs({ speakReplies: v })} />
          <Row
            title="Conversa contínua"
            subtitle="Volta a ouvir após cada resposta; dois silêncios encerram"
            value={prefs.continuousConversation}
            onChange={(v) => setPrefs({ continuousConversation: v })}
          />
          <Row
            title="Voz premium (servidor)"
            subtitle={health?.tts.configured ? "ElevenLabs configurada no backend" : "Não configurada no backend — usando a voz do iPhone"}
            value={prefs.premiumVoice}
            onChange={(v) => setPrefs({ premiumVoice: v })}
            disabled={!health?.tts.configured}
          />
          <Text style={[font.small, { marginTop: space(3) }]}>Voz do iPhone (pt-BR). Para vozes mais naturais, baixe em Ajustes › Acessibilidade › Conteúdo Falado › Vozes › Português (Brasil).</Text>
          <View style={styles.voices}>
            <Pressable onPress={() => setPrefs({ voiceIdentifier: null })} style={[styles.voice, !prefs.voiceIdentifier && styles.voiceActive]}>
              <Text style={[font.small, { color: !prefs.voiceIdentifier ? colors.bg : colors.text }]}>Padrão</Text>
            </Pressable>
            {voices.map((v) => {
              const active = prefs.voiceIdentifier === v.identifier;
              return (
                <Pressable key={v.identifier} onPress={() => setPrefs({ voiceIdentifier: v.identifier })} style={[styles.voice, active && styles.voiceActive]}>
                  <Text style={[font.small, { color: active ? colors.bg : colors.text }]}>
                    {v.name}
                    {v.quality === "Enhanced" ? " ★" : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", gap: space(2), marginTop: space(3), alignItems: "center" }}>
            <Text style={font.small}>Velocidade</Text>
            {[0.9, 1.0, 1.1].map((r) => (
              <Pressable key={r} onPress={() => setPrefs({ speechRate: r })} style={[styles.voice, prefs.speechRate === r && styles.voiceActive]}>
                <Text style={[font.small, { color: prefs.speechRate === r ? colors.bg : colors.text }]}>{r.toFixed(1)}×</Text>
              </Pressable>
            ))}
          </View>
          <Button title="Testar voz" variant="ghost" icon="play.fill" onPress={testVoice} style={{ marginTop: space(3) }} />
        </Card>

        <SectionTitle>SEGURANÇA</SectionTitle>
        <Card>
          <Row
            title="Bloquear com Face ID"
            subtitle={biometricAvailable ? "Pede Face ID ao abrir e ao voltar após 30 s" : "Face ID indisponível ou não cadastrado neste aparelho"}
            value={prefs.biometricLock}
            onChange={toggleBiometric}
            disabled={!biometricAvailable}
          />
        </Card>

        <SectionTitle>ATALHO DE VOZ (SIRI / BOTÃO DE AÇÃO)</SectionTitle>
        <Card style={{ gap: space(2) }}>
          <Text style={font.small}>
            No app Atalhos, crie um atalho com a ação “Abrir URL” e o endereço abaixo. Dê o nome “Conversar com Jarvis” para chamá-lo pela Siri, e escolha-o em Ajustes › Botão de Ação › Atalho.
          </Text>
          <Text selectable style={[font.mono, { color: colors.text }]}>jarvis://?ouvir=1</Text>
          <Text style={font.small}>Atalhos nativos (App Intents) chegam na Fase 3.</Text>
        </Card>

        <SectionTitle>CONEXÃO</SectionTitle>
        <Card style={{ gap: space(2) }}>
          <Text style={font.small}>Servidor: {config.apiUrl || "(não configurado)"}</Text>
          {health ? (
            <>
              <Pill label={health.ai.configured ? `IA: ${health.ai.model}` : "IA NÃO CONFIGURADA"} color={health.ai.configured ? colors.green : colors.amber} />
              <Text style={font.small}>Versão do backend: {health.version}</Text>
            </>
          ) : (
            <Pill label="SERVIDOR INDISPONÍVEL" color={colors.red} />
          )}
          <Text style={font.small}>Conta: {session?.user.email}</Text>
        </Card>

        <Button title="Sair da conta" variant="danger" icon="rectangle.portrait.and.arrow.right" onPress={signOut} style={{ marginTop: space(6) }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(2) },
  input: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
    paddingHorizontal: space(3),
    paddingVertical: space(2.5),
    color: colors.text,
    fontSize: 16,
  },
  voices: { flexDirection: "row", flexWrap: "wrap", gap: space(2), marginTop: space(2) },
  voice: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) },
  voiceActive: { backgroundColor: colors.cyan, borderColor: colors.cyan },
});
