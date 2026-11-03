/**
 * Montagem de links oficiais do iOS para abrir ligação, SMS, WhatsApp (wa.me),
 * e-mail, Mapas e páginas. Nada é enviado automaticamente: o app de destino abre
 * com o conteúdo pronto e o usuário decide.
 */
export type Channel = "ligacao" | "sms" | "whatsapp" | "email" | "mapa" | "link";

/** Mantém só dígitos e "+"; números brasileiros sem DDI recebem +55. */
export function normalizePhone(raw: string, defaultCountry = "55"): string | null {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (plus) return `+${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  // 10 ou 11 dígitos: DDD + número (Brasil). Remove o 0 de operadora/DDD, se houver.
  const national = digits.startsWith("0") ? digits.slice(1) : digits;
  if (national.length === 10 || national.length === 11) return `+${defaultCountry}${national}`;
  if (digits.length >= 12) return `+${digits}`;
  return digits; // número local curto (ex.: ramal)
}

export const isEmail = (s: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s.trim());

export interface LinkInput {
  canal: Channel;
  destino: string;
  mensagem?: string;
  assunto?: string;
}

export function buildLink(i: LinkInput): string {
  const enc = encodeURIComponent;
  switch (i.canal) {
    case "ligacao": {
      const p = normalizePhone(i.destino);
      if (!p) throw new Error("Número de telefone inválido.");
      return `tel:${p}`;
    }
    case "sms": {
      const p = normalizePhone(i.destino);
      if (!p) throw new Error("Número de telefone inválido.");
      return `sms:${p}${i.mensagem ? `&body=${enc(i.mensagem)}` : ""}`;
    }
    case "whatsapp": {
      const p = normalizePhone(i.destino);
      if (!p || !p.startsWith("+")) throw new Error("Número de WhatsApp inválido (precisa do DDD).");
      return `https://wa.me/${p.slice(1)}${i.mensagem ? `?text=${enc(i.mensagem)}` : ""}`;
    }
    case "email": {
      if (!isEmail(i.destino)) throw new Error("E-mail inválido.");
      const params = [i.assunto ? `subject=${enc(i.assunto)}` : "", i.mensagem ? `body=${enc(i.mensagem)}` : ""].filter(Boolean).join("&");
      return `mailto:${i.destino.trim()}${params ? `?${params}` : ""}`;
    }
    case "mapa":
      return `https://maps.apple.com/?q=${enc(i.destino)}`;
    case "link":
      if (!/^https:\/\//i.test(i.destino)) throw new Error("Somente links https:// são permitidos.");
      return i.destino;
  }
}

/** Escolhe o contato pelo nome: exato (sem acento) > começa com > contém. */
export function pickContactsByName<T extends { name: string }>(contacts: T[], query: string): T[] {
  const n = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
  const q = n(query);
  const exact = contacts.filter((c) => n(c.name) === q);
  if (exact.length) return exact;
  const starts = contacts.filter((c) => n(c.name).startsWith(q));
  if (starts.length) return starts;
  return contacts.filter((c) => n(c.name).includes(q));
}
