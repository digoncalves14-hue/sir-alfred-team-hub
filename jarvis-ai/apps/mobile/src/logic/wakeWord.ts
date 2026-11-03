/**
 * Tratamento da palavra de ativação "Jarvis" no INÍCIO da fala transcrita.
 * Funciona apenas com o app aberto e o microfone ativo — o iOS não permite
 * escuta permanente em segundo plano por apps de terceiros.
 */
import { normalizeText } from "./text";

// Variações comuns de reconhecimento de "Jarvis" em pt-BR.
const WAKE = "(?:jarvis|jarvi|javis|jarves|jervis|jarbas|jarviz|djarvis)";
const PREFIX = new RegExp(`^\\s*(?:(?:ok|ei|ey|hey|e ai|oi|ola|fala)[\\s,]+)?${WAKE}\\b[\\s,.!?:;-]*`, "i");

export function hasWakeWord(text: string): boolean {
  return PREFIX.test(normalizeText(text));
}

/** Remove a palavra de ativação do começo, preservando o restante do texto original. */
export function stripWakeWord(text: string): string {
  const norm = normalizeText(text);
  const m = norm.match(PREFIX);
  if (!m) return text.trim();
  // normalizeText preserva o comprimento (só remove acentos combinantes após NFC→NFD→NFC).
  return text.slice(m[0].length).trim();
}

const STOP = /^(?:(?:obrigado|valeu|ok)[\s,]+)?(?:jarvis[\s,]+)?(?:pode parar|parar|pare|encerrar|encerre|tchau|ate logo|e so isso|so isso|desligar|chega)[\s.!]*$/i;

/** Frases que encerram a conversa contínua (sem enviar ao servidor). */
export function isStopCommand(text: string): boolean {
  return STOP.test(normalizeText(text).trim());
}
