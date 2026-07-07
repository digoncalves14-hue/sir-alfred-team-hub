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
  { id: "thiago", name: "Thiago", role: "Barbeiro", unit: "Araçatuba+Birigui", clients: 52, goal: 50, rating: 4.9, rank: 1, category: "barber", initials: "TH", mood: "😁" },
  { id: "lucas", name: "Lucas", role: "Barbeiro", unit: "Birigui", clients: 44, goal: 50, rating: 4.9, rank: 2, category: "barber", initials: "LU", mood: "😊" },
  { id: "diego", name: "Diego", role: "Gestor / Barbeiro", unit: "Birigui / Araçatuba", clients: 40, goal: 50, rating: 4.8, rank: 3, category: "barber", initials: "DI", mood: "😊" },
  { id: "luizfelipe", name: "Luiz Felipe", role: "Barbeiro", unit: "Birigui", clients: 33, goal: 50, rating: 4.6, rank: 4, category: "barber", initials: "LF", mood: "😐" },
  { id: "karitta", name: "Karitta", role: "Barbeira", unit: "Birigui", clients: 29, goal: 50, rating: 4.7, rank: 5, category: "barber", initials: "KA", mood: "😁" },
  { id: "diegorios", name: "Diego Rios", role: "Barbeiro", unit: "Penápolis", clients: 26, goal: 40, rating: 4.5, rank: 6, category: "barber", initials: "DR", mood: "😊" },
  { id: "rocha", name: "Rocha", role: "Barbeiro", unit: "Penápolis", clients: 21, goal: 40, rating: 4.3, rank: 7, category: "barber", initials: "RO", mood: "😔" },
  { id: "larissa", name: "Larissa", role: "Gestora / Cabeleireira", unit: "Kids", clients: 38, goal: 40, rating: 4.9, rank: 1, category: "support", initials: "LA", mood: "😁" },
  { id: "thyffannys", name: "Thyffannys", role: "Secretaria / Manicure", unit: "Birigui", clients: 32, goal: 40, rating: 4.8, rank: 2, category: "support", initials: "TY", mood: "😊" },
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
