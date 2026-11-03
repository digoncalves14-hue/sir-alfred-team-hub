/**
 * Divide o texto que chega em streaming em frases completas, para o Jarvis começar a
 * falar na primeira frase. Evita cortar em abreviações ("Sr.", "Dra.") e números ("R$ 1.234,56").
 */
const ABBREVIATIONS = /(?:^|\s)(sr|sra|srta|dr|dra|prof|profa|av|r|n|nº|etc|ex|obs|aprox|tel|pág|vs)\.$/i;

export class SentenceBuffer {
  private buf = "";

  /** Adiciona texto e devolve as frases completas encontradas. */
  push(text: string): string[] {
    this.buf += text;
    const out: string[] = [];
    let start = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const ch = this.buf[i]!;
      const next = this.buf[i + 1];
      if (ch === "\n") {
        const s = this.buf.slice(start, i).trim();
        if (s) out.push(s);
        start = i + 1;
        continue;
      }
      if (!".!?…".includes(ch)) continue;
      if (next === undefined) break; // ainda não sabemos se a frase terminou
      if (next !== " " && next !== "\n" && !".!?…\"')".includes(next)) continue; // "1.234", "15.30"
      if (ch === "." && ABBREVIATIONS.test(this.buf.slice(start, i + 1))) continue;
      const candidate = this.buf.slice(start, i + 1).trim();
      if (candidate.length < 12) continue; // frases muito curtas soam picotadas
      out.push(candidate);
      start = i + 1;
    }
    this.buf = this.buf.slice(start);
    return out;
  }

  /** Restante (fim do streaming). */
  flush(): string | null {
    const rest = this.buf.trim();
    this.buf = "";
    return rest || null;
  }
}

/** Limpa markdown, emojis e URLs para a fala (mesma regra do servidor). */
export function forSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "o link")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, "$2")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}
