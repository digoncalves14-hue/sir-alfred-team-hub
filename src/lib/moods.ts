export type MoodOption = { emoji: string; label: string };

export const MOOD_OPTIONS: MoodOption[] = [
  { emoji: "😁", label: "Feliz" },
  { emoji: "😊", label: "Bem" },
  { emoji: "😐", label: "Neutro" },
  { emoji: "😔", label: "Triste" },
  { emoji: "😤", label: "Nervoso" },
];

export const moodLabels: Record<string, string> = Object.fromEntries(
  MOOD_OPTIONS.map((m) => [m.emoji, m.label]),
);
