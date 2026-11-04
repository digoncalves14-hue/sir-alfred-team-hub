/**
 * Sessão Supabase + bloqueio local por Face ID.
 * O Face ID protege o ACESSO LOCAL ao app; a autenticação no servidor continua
 * sendo a sessão Supabase (token renovado automaticamente).
 */
import type { Session } from "@supabase/supabase-js";
import * as LocalAuthentication from "expo-local-authentication";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { usePrefs } from "./PrefsProvider";

interface Ctx {
  session: Session | null;
  loading: boolean;
  locked: boolean;
  unlock: () => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Ctx | null>(null);

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(message)) return "Confirme seu e-mail pelo link enviado antes de entrar.";
  if (/user already registered/i.test(message)) return "Este e-mail já está cadastrado. Use Entrar.";
  if (/password should be/i.test(message)) return "A senha precisa ter pelo menos 8 caracteres.";
  if (/network/i.test(message)) return "Sem conexão com o servidor de autenticação.";
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { prefs, ready } = usePrefs();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const lockEnabled = useRef(prefs.biometricLock);
  lockEnabled.current = prefs.biometricLock;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Bloqueia ao abrir e ao voltar do segundo plano (após 30 s), se ativado.
  useEffect(() => {
    if (!ready) return;
    if (prefs.biometricLock) setLocked(true);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") backgroundedAt.current = Date.now();
      if (state === "active" && lockEnabled.current && backgroundedAt.current && Date.now() - backgroundedAt.current > 30_000) {
        setLocked(true);
      }
    });
    return () => sub.remove();
    // Executa uma vez quando as preferências carregam; o valor atual vem de lockEnabled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!prefs.biometricLock) setLocked(false);
  }, [prefs.biometricLock]);

  const unlock = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Desbloquear o JARVIS",
      cancelLabel: "Cancelar",
      fallbackLabel: "Usar código",
    });
    if (result.success) setLocked(false);
    return result.success;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? translateAuthError(error.message) : null;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    // Versão web: o link de confirmação do e-mail volta para o próprio Jarvis.
    const emailRedirectTo = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : undefined;
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: emailRedirectTo ? { emailRedirectTo } : undefined });
    if (error) return translateAuthError(error.message);
    if (!data.session) return "Conta criada. Confirme o e-mail pelo link enviado e depois entre.";
    return null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ session, loading: loading || !ready, locked: locked && !!session, unlock, signIn, signUp, signOut }),
    [session, loading, ready, locked, unlock, signIn, signUp, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}
