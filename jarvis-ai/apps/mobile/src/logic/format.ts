export function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) return `US$ ${value.toFixed(4).replace(".", ",")}`;
  return `US$ ${value.toFixed(2).replace(".", ",")}`;
}

/** "agora", "há 5 min", "há 3 h", "ontem", ou data curta. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86_400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 172_800) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/** Saudação conforme o horário local. */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Boa noite";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
