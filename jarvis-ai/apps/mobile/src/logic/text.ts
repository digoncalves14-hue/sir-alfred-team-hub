/** Remove acentos mantendo o mesmo número de caracteres para textos em NFC. */
export function normalizeText(text: string): string {
  return Array.from(text.normalize("NFC"))
    .map((ch) => ch.normalize("NFD").replace(/[̀-ͯ]/g, "") || ch)
    .join("")
    .toLowerCase();
}
