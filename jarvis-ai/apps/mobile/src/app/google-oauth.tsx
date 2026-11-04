/**
 * Retorno do login do Google na versão web: recebe ?code&state, conclui a conexão
 * no backend (que confere se o pedido é deste usuário) e volta para Ajustes.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { HoloOrb } from "@/components/HoloOrb";
import { Button, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font, space } from "@/theme";

export default function GoogleOAuthReturn() {
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (params.error) {
      setStatus({ ok: false, message: params.error === "access_denied" ? "Você não autorizou o acesso." : `O Google retornou: ${params.error}` });
      return;
    }
    if (!params.code || !params.state) {
      setStatus({ ok: false, message: "Resposta do Google incompleta. Tente conectar novamente." });
      return;
    }
    api
      .googleComplete(params.code, params.state)
      .then((r) => setStatus({ ok: true, message: `${r.accountEmail ?? "Conta Google"} conectada.` }))
      .catch((e) => setStatus({ ok: false, message: e instanceof Error ? e.message : "Falha ao conectar." }));
  }, [params.code, params.state, params.error]);

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space(5) }}>
        <HoloOrb phase={status ? "idle" : "processing"} level={0} size={160} />
        <Text style={font.title}>{status ? (status.ok ? "Google conectado" : "Não foi possível conectar") : "Conectando ao Google…"}</Text>
        {status ? <Text style={[font.body, { textAlign: "center", color: status.ok ? colors.text : colors.red }]}>{status.message}</Text> : null}
        {status ? <Button title="Voltar aos Ajustes" onPress={() => router.replace("/settings")} /> : null}
      </View>
    </Screen>
  );
}
