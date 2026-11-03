/**
 * Detecção de dados sensíveis que NÃO devem ir para a memória persistente
 * (senhas, cartões, CPF, chaves/tokens). Bloqueio feito no servidor, independentemente do modelo.
 */
const PATTERNS: { label: string; re: RegExp }[] = [
  { label: "senha", re: /\b(senha|password|passcode|pin)\b\s*[:=é]?\s*\S+/i },
  { label: "cartão de crédito", re: /\b(?:\d[ -]?){13,19}\b/ },
  { label: "CPF", re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/ },
  { label: "chave de API ou token", re: /\b(sk-[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,})\b/ },
  { label: "código de segurança (CVV)", re: /\b(cvv|cvc)\b\s*[:=]?\s*\d{3,4}/i },
];

export function detectSensitive(text: string): string | null {
  for (const p of PATTERNS) if (p.re.test(text)) return p.label;
  return null;
}
