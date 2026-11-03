/**
 * Proteção contra prompt injection: todo conteúdo vindo de dados (memórias,
 * e futuramente e-mails, agenda, páginas) é delimitado e marcado como dado,
 * nunca como instrução. O prompt de sistema orienta o modelo a ignorar
 * ordens encontradas dentro desses blocos.
 */
export function wrapUntrusted(source: string, content: string): string {
  // Impede que o conteúdo "feche" o bloco e escape do delimitador.
  const sanitized = content.replace(/<\/?dados_externos[^>]*>/gi, "[tag removida]");
  return `<dados_externos origem="${source}">\n${sanitized}\n</dados_externos>`;
}
