/** Identidade visual original do JARVIS AI: azul-marinho quase preto + ciano holográfico. */
export const colors = {
  bg: "#03060F",
  bgElevated: "#08101F",
  card: "rgba(12, 28, 52, 0.72)",
  cardBorder: "rgba(56, 220, 255, 0.18)",
  cyan: "#38DCFF",
  cyanSoft: "rgba(56, 220, 255, 0.55)",
  cyanFaint: "rgba(56, 220, 255, 0.12)",
  blue: "#1E7BFF",
  violet: "#7C6CFF",
  amber: "#FFB547",
  green: "#3DFFB4",
  red: "#FF5C7A",
  text: "#E8F6FF",
  textDim: "#8CA8C2",
  textFaint: "#4F6680",
} as const;

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
export const space = (n: number) => n * 4;

export const font = {
  title: { fontSize: 22, fontWeight: "700" as const, letterSpacing: 2, color: colors.text },
  heading: { fontSize: 15, fontWeight: "600" as const, letterSpacing: 1.2, color: colors.cyan },
  body: { fontSize: 16, lineHeight: 22, color: colors.text },
  small: { fontSize: 13, lineHeight: 18, color: colors.textDim },
  mono: { fontSize: 12, letterSpacing: 1.5, color: colors.cyanSoft, fontVariant: ["tabular-nums" as const] },
};
