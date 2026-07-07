export type Professional = {
  id: string;
  name: string;
  role: string;
  unit: string;
  clients: number;
  goal: number;
  rating: number;
  rank: number;
  category: "barber" | "support";
  initials: string;
  mood: "😁" | "😊" | "😐" | "😔" | "😤";
};

// Dados zerados — preencher manualmente conforme o uso real.
export const team: Professional[] = [];

export const announcements: {
  id: number;
  type: string;
  unit: string;
  message: string;
  date: string;
  color: string;
}[] = [];

export const feedbacks: {
  id: number;
  pro: string;
  type: string;
  message: string;
  color: string;
}[] = [];

export const awards: {
  id: number;
  type: string;
  winner: string;
  desc: string;
  active: boolean;
}[] = [];

export const reviews: { id: number; pro: string; stars: number; comment: string }[] = [];

export const library: { title: string; count: number; icon: string }[] = [];

// POPs continuam sendo definidos no próprio componente Pops.tsx (conteúdo pronto).
export const pops: any[] = [];

export const updates: { who: string; what: string; when: string }[] = [];

export const birthdays: { name: string; unit: string; days: number }[] = [];

export const personalHistory: {
  type: string;
  icon: string;
  title: string;
  date: string;
  color: string;
}[] = [];
