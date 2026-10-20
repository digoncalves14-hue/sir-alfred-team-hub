/** Texto preto ou branco, o que for mais legível sobre a cor (#RRGGBB). */
export function readableOn(hex: string): string {
  const n = /^#[0-9a-fA-F]{6}$/.test(hex) ? parseInt(hex.slice(1), 16) : 0x0b0b0c;
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#111111" : "#FFFFFF";
}
