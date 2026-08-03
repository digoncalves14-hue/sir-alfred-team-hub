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

export const team: Professional[] = [
  { id: "lucas", name: "Lucas", role: "Barbeiro", unit: "Birigui", clients: 0, goal: 0, rating: 0, rank: 0, category: "barber", initials: "LU", mood: "😐" },
  
  { id: "luizfelipe", name: "Luiz Felipe", role: "Barbeiro", unit: "Birigui", clients: 0, goal: 0, rating: 0, rank: 0, category: "barber", initials: "LF", mood: "😐" },
  { id: "karitta", name: "Karitta", role: "Barbeira", unit: "Birigui", clients: 0, goal: 0, rating: 0, rank: 0, category: "barber", initials: "KA", mood: "😐" },
  { id: "larissa", name: "Larissa", role: "Gestora / Cabeleireira", unit: "Kids", clients: 0, goal: 0, rating: 0, rank: 0, category: "support", initials: "LA", mood: "😐" },
  { id: "thyffannys", name: "Thyffannys", role: "Secretaria / Manicure", unit: "Birigui", clients: 0, goal: 0, rating: 0, rank: 0, category: "support", initials: "TY", mood: "😐" },
];

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
