import type { ChatMessage, DeviceAction, Health, ToolEvent } from "@jarvis/shared";
import { useFocusEffect, useLocalSearchParams, router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { MessageBubble, PendingActionCard } from "@/components/chat";
import { HoloOrb } from "@/components/HoloOrb";
import { Button, Card, ErrorBanner, Icon, Pill, Screen } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { executeDeviceAction, gatherDeviceContext, type Chooser } from "@/lib/device";
import { chatStream } from "@/lib/stream";
import { createSpeechStream, setWebServerVoice, type SpeechStream, unlockWebSpeech } from "@/voice/tts";
import { greeting } from "@/logic/format";
import type { VoicePhase } from "@/logic/voiceMachine";
import { usePrefs } from "@/providers/PrefsProvider";
import { useVoiceEngine } from "@/voice/useVoiceEngine";
import { colors, font, radius, space } from "@/theme";

const deviceTimezone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
})();

const PHASE_LABEL: Record<VoicePhase, string> = {
  idle: "Toque no núcleo para falar",
  listening: "Ouvindo… toque para enviar",
  processing: "Processando…",
  speaking: "Falando… toque para interromper",
  error: "Toque para tentar novamente",
};

type Conn = { status: "checking" } | { status: "online"; health: Health } | { status: "offline"; message: string };

interface Pending {
  id: string;
  summary: string;
  /** Ação executada no próprio iPhone após a confirmação. */
  device?: DeviceAction;
}

/** Pergunta ao usuário qual opção usar (ex.: qual número do contato). */
const chooseWithAlert: Chooser = (title, options) =>
  new Promise((resolve) => {
    Alert.alert(title, undefined, [
      ...options.slice(0, 5).map((label, i) => ({ text: label, onPress: () => resolve(i) })),
      { text: "Cancelar", style: "cancel" as const, onPress: () => resolve(null) },
    ]);
  });

export default function JarvisScreen() {
  const { prefs, setPrefs } = usePrefs();
  const params = useLocalSearchParams<{ ouvir?: string; pergunta?: string; rotina?: string; n?: string }>();
  const [conn, setConn] = useState<Conn>({ status: "checking" });
  const [ownerName, setOwnerName] = useState("senhor");
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Resposta chegando em streaming (texto parcial + ferramentas em execução). */
  const [live, setLive] = useState<{ text: string; tools: ToolEvent[] } | null>(null);
  const streamingRef = useRef(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const conversationRef = useRef(conversationId);
  conversationRef.current = conversationId;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const checkConnection = useCallback(async () => {
    setConn({ status: "checking" });
    try {
      const health = await api.health();
      streamingRef.current = health.streaming;
      setWebServerVoice(health.tts.configured);
      setConn({ status: "online", health });
      const me = await api.me();
      setOwnerName(me.profile.ownerName);
    } catch (e) {
      setConn({ status: "offline", message: e instanceof Error ? e.message : "Servidor indisponível" });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void checkConnection();
      api
        .pendingActions()
        .then((r) => setPending(r.actions.map((a) => ({ id: a.id, summary: a.summary, device: a.device }))))
        .catch(() => undefined);
    }, [checkConnection]),
  );

  const absorbReply = useCallback((userText: string, reply: ChatMessage, newConversationId: string) => {
    setConversationId(newConversationId);
    const now = new Date().toISOString();
    setMessages((prev) => [...prev, { id: `local-${now}`, role: "user", content: userText, toolEvents: [], createdAt: now }, reply]);
    const newPending = reply.toolEvents.filter((e): e is ToolEvent & { pendingActionId: string } => e.status === "pending" && !!e.pendingActionId);
    if (newPending.length) setPending((prev) => [...newPending.map((e) => ({ id: e.pendingActionId, summary: e.summary, device: e.device })), ...prev]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  /**
   * Envia ao Jarvis. Com streaming (Fase 5), o texto aparece e é falado frase a frase
   * (`sink`) e a função devolve null; sem streaming, devolve o texto para falar inteiro.
   */
  const send = useCallback(
    async (text: string, inputMode: "voice" | "text", sink: SpeechStream | null = null, routineId?: string): Promise<string | null> => {
      setError(null);
      try {
        // Dados do iPhone (somente o que foi autorizado em Ajustes; no máximo ~2,5 s).
        const deviceContext = await gatherDeviceContext({ calendar: prefsRef.current.deviceCalendar, location: prefsRef.current.deviceLocation });
        const req = { message: text, conversationId: conversationRef.current, inputMode, timezone: deviceTimezone, deviceContext, routineId, client: Platform.OS === "web" ? ("web" as const) : ("ios" as const) };
        if (streamingRef.current) {
          setLive({ text: "", tools: [] });
          const res = await chatStream(req, {
            onDelta: (d) => {
              sink?.push(d);
              setLive((l) => (l ? { ...l, text: l.text + d } : l));
            },
            onTool: (ev) => setLive((l) => (l ? { ...l, tools: [...l.tools, ev] } : l)),
          });
          setLive(null);
          absorbReply(text, res.reply, res.conversationId);
          if (res.notice) setNotice(res.notice);
          return sink ? null : res.speech;
        }
        const res = await api.chat(req);
        absorbReply(text, res.reply, res.conversationId);
        if (res.notice) setNotice(res.notice);
        return res.speech;
      } catch (e) {
        setLive(null);
        const message = e instanceof ApiError ? e.message : "Falha ao falar com o Jarvis.";
        setError(message);
        if (e instanceof ApiError && e.status === 401) router.replace("/login");
        // Fala o erro de forma honesta, sem fingir que algo foi feito.
        return message;
      }
    },
    [absorbReply],
  );

  const voice = useVoiceEngine({
    onUtterance: (text, sink) => send(text, "voice", sink),
    speakReplies: prefs.speakReplies,
    bargeIn: prefs.bargeIn,
    speech: { voiceIdentifier: prefs.voiceIdentifier, rate: prefs.speechRate, premium: prefs.premiumVoice, serverVoiceId: prefs.serverVoiceId },
  });
  const { phase, transcript, level, error: voiceError } = voice.state;

  // Siri / Atalhos / Botão de Ação: "?ouvir=1" inicia a escuta; "?pergunta=..." envia a pergunta.
  // "n" é um identificador por pedido, para que pedidos repetidos também funcionem.
  const handledIntent = useRef<string | null>(null);
  useEffect(() => {
    const key = `${params.n ?? ""}|${params.ouvir ?? ""}|${params.pergunta ?? ""}|${params.rotina ?? ""}`;
    if (key === "|||" || handledIntent.current === key) return;
    handledIntent.current = key;
    if (params.rotina) {
      // Rotina agendada: o usuário tocou na notificação.
      void speakTyped("Executar rotina", params.rotina);
    } else if (params.pergunta) {
      void speakTyped(params.pergunta);
    } else if (params.ouvir) {
      void voice.start(prefs.continuousConversation);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.n, params.ouvir, params.pergunta, params.rotina, prefs.continuousConversation]);

  const onOrbPress = () => {
    if (phase === "idle" || phase === "error") void voice.start(prefs.continuousConversation);
    else if (phase === "listening") voice.finish();
    else if (phase === "speaking") void voice.interrupt();
  };

  /** Texto digitado (ou vindo de Siri/rotina): também fala frase a frase quando há streaming. */
  async function speakTyped(text: string, routineId?: string) {
    setSending(true);
    const sink = prefsRef.current.speakReplies
      ? createSpeechStream({ voiceIdentifier: prefsRef.current.voiceIdentifier, rate: prefsRef.current.speechRate, premium: prefsRef.current.premiumVoice, serverVoiceId: prefsRef.current.serverVoiceId }, () => undefined)
      : null;
    const speech = await send(text, "text", sink, routineId);
    setSending(false);
    if (sink) {
      if (speech) sink.push(speech);
      await sink.end();
    }
  }

  const sendTyped = async () => {
    const text = typed.trim();
    if (!text || sending) return;
    setTyped("");
    if (Platform.OS === "web") unlockWebSpeech(); // toque no enviar libera a voz no Safari
    await speakTyped(text);
  };

  const confirmAll = async () => {
    const ids = pending.filter((p) => !p.device).map((p) => p.id);
    if (ids.length < 2) return;
    setBusyAction("all");
    try {
      const { results } = await api.confirmBatch(ids);
      const ok = results.filter((r) => r.ok).length;
      const msg = `${ok} de ${results.length} ações concluídas.${ok < results.length ? ` Falhas: ${results.filter((r) => !r.ok).map((r) => r.message).join("; ")}` : ""}`;
      const now = new Date().toISOString();
      setMessages((prev) => [...prev, { id: `batch-${now}`, role: "assistant", content: msg, toolEvents: [], createdAt: now }]);
      setPending((prev) => prev.filter((p) => !ids.includes(p.id)));
      void voice.say(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao confirmar.");
    } finally {
      setBusyAction(null);
    }
  };

  const resolveAction = async (id: string, confirm: boolean) => {
    setBusyAction(id);
    const item = pending.find((p) => p.id === id);
    try {
      let r;
      if (confirm && item?.device) {
        // Executa NO iPhone e reporta o resultado real ao servidor.
        const result = await executeDeviceAction(item.device, chooseWithAlert);
        r = await api.reportDeviceAction(id, result.success, result.summary);
      } else {
        r = confirm ? await api.confirmAction(id) : await api.rejectAction(id);
      }
      const now = new Date().toISOString();
      setMessages((prev) => [
        ...prev,
        {
          id: `act-${id}`,
          role: "assistant",
          content: r.message,
          toolEvents: [{ tool: r.action.tool, label: "", status: r.action.status === "confirmed" ? "executed" : r.action.status === "rejected" ? "rejected" : "failed", summary: r.action.summary }],
          createdAt: now,
        },
      ]);
      void voice.say(r.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao resolver a ação.");
    } finally {
      setPending((prev) => prev.filter((p) => p.id !== id));
      setBusyAction(null);
    }
  };

  const newConversation = async () => {
    await voice.stop();
    setConversationId(undefined);
    setMessages([]);
    setError(null);
  };

  const connPill =
    conn.status === "checking" ? (
      <Pill label="CONECTANDO" color={colors.textDim} />
    ) : conn.status === "offline" ? (
      <Pill label="OFFLINE" color={colors.red} />
    ) : conn.health.ai.configured ? (
      <Pill label="ONLINE" color={colors.green} />
    ) : (
      <Pill label="IA NÃO CONFIGURADA" color={colors.amber} />
    );

  return (
    <Screen>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={80}>
        <View style={styles.header}>
          <View>
            <Text style={font.title}>JARVIS</Text>
            <Text style={font.small}>
              {greeting()}, {ownerName}.
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: space(2) }}>
            {connPill}
            <View style={{ flexDirection: "row", gap: space(4) }}>
              <Pressable onPress={() => setPrefs({ speakReplies: !prefs.speakReplies })} accessibilityLabel={prefs.speakReplies ? "Desativar áudio" : "Ativar áudio"}>
                <Icon name={prefs.speakReplies ? "speaker.wave.2.fill" : "speaker.slash.fill"} color={prefs.speakReplies ? colors.cyan : colors.textDim} />
              </Pressable>
              <Pressable onPress={() => router.push("/history")} accessibilityLabel="Histórico de conversas">
                <Icon name="clock.arrow.circlepath" />
              </Pressable>
              <Pressable onPress={newConversation} accessibilityLabel="Nova conversa">
                <Icon name="square.and.pencil" />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.orbArea}>
          <HoloOrb
            phase={phase}
            level={level}
            size={messages.length > 0 ? 230 : 290}
            onPress={onOrbPress}
            onLongPress={() => void voice.stop()}
            accessibilityLabel={PHASE_LABEL[phase]}
          />
          <Text style={[font.mono, { marginTop: space(2) }]}>{PHASE_LABEL[phase].toUpperCase()}</Text>
          {voice.state.sessionActive ? <Text style={font.small}>Conversa contínua ativa · segure o núcleo para encerrar</Text> : null}
          {transcript && (phase === "listening" || phase === "processing") ? (
            <Text style={[font.body, styles.transcript]} numberOfLines={3}>
              “{transcript}”
            </Text>
          ) : null}
        </View>

        {conn.status === "offline" ? <ErrorBanner message={conn.message} onRetry={checkConnection} /> : null}
        {error || voiceError ? <ErrorBanner message={(voiceError ?? error)!} /> : null}

        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: space(2), gap: space(2) }}>
          {notice ? (
            <Pressable onPress={() => setNotice(null)}>
              <Card style={{ borderColor: colors.amber }}>
                <Text style={[font.small, { color: colors.amber }]}>{notice}</Text>
              </Card>
            </Pressable>
          ) : null}
          {pending.filter((p) => !p.device).length >= 2 ? (
            <Button title={`Confirmar todas (${pending.filter((p) => !p.device).length})`} icon="checkmark.circle" onPress={confirmAll} loading={busyAction === "all"} />
          ) : null}
          {pending.map((p) => (
            <PendingActionCard key={p.id} summary={p.summary} busy={busyAction === p.id} onConfirm={() => resolveAction(p.id, true)} onReject={() => resolveAction(p.id, false)} />
          ))}
          {messages.slice(-12).map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {live ? (
            <MessageBubble message={{ id: "live", role: "assistant", content: live.text || "…", toolEvents: live.tools, createdAt: "" }} />
          ) : null}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Ou digite para o Jarvis…"
            placeholderTextColor={colors.textFaint}
            value={typed}
            onChangeText={setTyped}
            onSubmitEditing={sendTyped}
            returnKeyType="send"
            editable={!sending}
          />
          <Pressable onPress={sendTyped} style={styles.sendBtn} accessibilityLabel="Enviar">
            <Icon name={sending ? "ellipsis" : "arrow.up.circle.fill"} size={30} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  orbArea: { alignItems: "center", paddingVertical: space(2) },
  transcript: { marginTop: space(2), textAlign: "center", color: colors.textDim, fontStyle: "italic", paddingHorizontal: space(4) },
  inputRow: { flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(2) },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    color: colors.text,
    fontSize: 16,
  },
  sendBtn: { padding: space(1) },
});
