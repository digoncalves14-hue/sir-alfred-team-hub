import type { GoogleService, Health, IntegrationStatus, Profile } from "@jarvis/shared";
import * as LocalAuthentication from "expo-local-authentication";
import type { Voice } from "expo-speech";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Button, Card, ErrorBanner, Pill, Screen, SectionTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { config } from "@/lib/config";
import { connectGoogle } from "@/lib/google";
import { registerForPush } from "@/lib/push";
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
  const [google, setGoogle] = useState<IntegrationStatus | null>(null);
  const [wanted, setWanted] = useState<GoogleService[]>(["calendar", "gmail"]);
  const [connecting, setConnecting] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const loadIntegrations = useCallback(async () => {
    try {
      const r = await api.integrations();
      const g = r.integrations.find((i) => i.provider === "google") ?? null;
      setGoogle(g);
      if (g?.connected && g.services.length) setWanted(g.services);
    } catch {
      setGoogle(null);
    }
  }, []);

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
      void loadIntegrations();
    }, [loadIntegrations]),
  );

  const updateProfile = async (patch: Partial<Profile>) => {
    if (!profile) return;
    const prev = profile;
    setProfile({ ...profile, ...patch });
    try {
      setProfile((await api.updateSettings(patch)).profile);
    } catch (e) {
      setProfile(prev);
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    }
  };

  const doConnect = async () => {
    if (wanted.length === 0) return setError("Escolha ao menos Agenda ou Gmail.");
    setConnecting(true);
    setError(null);
    try {
      const r = await connectGoogle(wanted);
      if (r.ok) Alert.alert("Google conectado", `${r.email ?? "Conta"} — ${r.services.map((s) => (s === "calendar" ? "Agenda" : "Gmail")).join(" e ")}.`);
      else if (!r.cancelled) setError(r.message);
      await loadIntegrations();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao conectar.");
    } finally {
      setConnecting(false);
    }
  };

  const doDisconnect = () =>
    Alert.alert("Desconectar o Google?", "O Jarvis perderá acesso à Agenda e ao Gmail, e a autorização será revogada no Google.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Desconectar",
        style: "destructive",
        onPress: async () => {
          try {
            await api.googleDisconnect();
            await loadIntegrations();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao desconectar.");
          }
        },
      },
    ]);

  const togglePush = async (v: boolean) => {
    if (!v) return setPrefs({ pushEnabled: false });
    setPushBusy(true);
    const r = await registerForPush();
    setPushBusy(false);
    if (r.ok) setPrefs({ pushEnabled: true });
    else setError(r.message);
  };

  const toggleService = (s: GoogleService) => setWanted((w) => (w.includes(s) ? w.filter((x) => x !== s) : [...w, s]));

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

        <SectionTitle>INTEGRAÇÕES</SectionTitle>
        <Card style={{ gap: space(3) }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[font.body, { fontWeight: "700" }]}>Google</Text>
            {!google ? null : !google.available ? (
              <Pill label="NÃO CONFIGURADO NO SERVIDOR" color={colors.textDim} />
            ) : google.connected && google.status === "active" ? (
              <Pill label="CONECTADO" color={colors.green} />
            ) : google.connected ? (
              <Pill label="RECONECTAR" color={colors.amber} />
            ) : (
              <Pill label="DESCONECTADO" color={colors.textDim} />
            )}
          </View>
          {google?.accountEmail ? <Text style={font.small}>{google.accountEmail}</Text> : null}
          {google?.lastError ? <Text style={[font.small, { color: colors.amber }]}>{google.lastError}</Text> : null}
          {google?.available ? (
            <>
              <View style={styles.voices}>
                {(["calendar", "gmail"] as const).map((s) => {
                  const active = wanted.includes(s);
                  return (
                    <Pressable key={s} onPress={() => toggleService(s)} style={[styles.voice, active && styles.voiceActive]}>
                      <Text style={[font.small, { color: active ? colors.bg : colors.text }]}>{s === "calendar" ? "Agenda" : "Gmail"}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={font.small}>
                Agenda: ver e criar compromissos. Gmail: ler, rascunhar e enviar e-mails (o envio sempre pede sua confirmação). O Jarvis nunca apaga e-mails.
              </Text>
              <Button
                title={google.connected ? "Reconectar / alterar permissões" : "Conectar conta Google"}
                icon="link"
                onPress={doConnect}
                loading={connecting}
                variant={google.connected ? "ghost" : "primary"}
              />
              {google.connected ? <Button title="Desconectar e revogar acesso" variant="danger" onPress={doDisconnect} /> : null}
            </>
          ) : (
            <Text style={font.small}>O backend precisa de GOOGLE_IOS_CLIENT_ID, TOKEN_ENCRYPTION_KEY e SUPABASE_SERVICE_ROLE_KEY. Veja docs/GOOGLE.md.</Text>
          )}
        </Card>

        <SectionTitle>NOTIFICAÇÕES</SectionTitle>
        <Card>
          <Row
            title="Notificações neste iPhone"
            subtitle={health?.push.configured ? "Lembretes, resumo diário e reuniões" : "Push não configurado no servidor"}
            value={prefs.pushEnabled}
            onChange={togglePush}
            disabled={pushBusy || !health?.push.configured}
          />
          {profile ? (
            <>
              <Row title="Resumo diário" subtitle={`Enviado às ${profile.dailySummaryTime}`} value={profile.dailySummaryEnabled} onChange={(v) => updateProfile({ dailySummaryEnabled: v })} />
              <View style={styles.voices}>
                {["06:30", "07:00", "07:30", "08:00", "08:30", "09:00"].map((t) => (
                  <Pressable key={t} onPress={() => updateProfile({ dailySummaryTime: t })} style={[styles.voice, profile.dailySummaryTime === t && styles.voiceActive]}>
                    <Text style={[font.small, { color: profile.dailySummaryTime === t ? colors.bg : colors.text }]}>{t}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[font.small, { marginTop: space(3) }]}>Avisar antes de reuniões da agenda</Text>
              <View style={styles.voices}>
                {[0, 5, 10, 15, 30].map((m) => (
                  <Pressable key={m} onPress={() => updateProfile({ meetingReminderMinutes: m })} style={[styles.voice, profile.meetingReminderMinutes === m && styles.voiceActive]}>
                    <Text style={[font.small, { color: profile.meetingReminderMinutes === m ? colors.bg : colors.text }]}>{m === 0 ? "Desligado" : `${m} min`}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <Text style={[font.small, { marginTop: space(3) }]}>
            Os avisos são enviados pelo servidor, mesmo com o app fechado — desde que o servidor esteja ligado.
          </Text>
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
