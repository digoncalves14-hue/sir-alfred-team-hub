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
  checkIn: { status: "present" | "late" | "absent" | "pending"; time: string };
  mood: "😁" | "😊" | "😐" | "😔" | "😤";
};

export const team: Professional[] = [
  { id: "thiago", name: "Thiago", role: "Barbeiro", unit: "Araçatuba+Birigui", clients: 52, goal: 50, rating: 4.9, rank: 1, category: "barber", initials: "TH", checkIn: { status: "present", time: "08:02" }, mood: "😁" },
  { id: "lucas", name: "Lucas", role: "Barbeiro", unit: "Birigui", clients: 44, goal: 50, rating: 4.9, rank: 2, category: "barber", initials: "LU", checkIn: { status: "present", time: "08:05" }, mood: "😊" },
  { id: "diego", name: "Diego", role: "Gestor / Barbeiro", unit: "Birigui / Araçatuba", clients: 40, goal: 50, rating: 4.8, rank: 3, category: "barber", initials: "DI", checkIn: { status: "present", time: "07:58" }, mood: "😊" },
  { id: "luizfelipe", name: "Luiz Felipe", role: "Barbeiro", unit: "Birigui", clients: 33, goal: 50, rating: 4.6, rank: 4, category: "barber", initials: "LF", checkIn: { status: "late", time: "09:20" }, mood: "😐" },
  { id: "karitta", name: "Karitta", role: "Barbeira", unit: "Birigui", clients: 29, goal: 50, rating: 4.7, rank: 5, category: "barber", initials: "KA", checkIn: { status: "present", time: "08:10" }, mood: "😁" },
  { id: "diegorios", name: "Diego Rios", role: "Barbeiro", unit: "Penápolis", clients: 26, goal: 40, rating: 4.5, rank: 6, category: "barber", initials: "DR", checkIn: { status: "present", time: "08:00" }, mood: "😊" },
  { id: "rocha", name: "Rocha", role: "Barbeiro", unit: "Penápolis", clients: 21, goal: 40, rating: 4.3, rank: 7, category: "barber", initials: "RO", checkIn: { status: "absent", time: "—" }, mood: "😔" },
  { id: "larissa", name: "Larissa", role: "Gestora / Cabeleireira", unit: "Kids", clients: 38, goal: 40, rating: 4.9, rank: 1, category: "support", initials: "LA", checkIn: { status: "present", time: "08:00" }, mood: "😁" },
  { id: "thyffannys", name: "Thyffannys", role: "Secretaria / Manicure", unit: "Birigui", clients: 32, goal: 40, rating: 4.8, rank: 2, category: "support", initials: "TY", checkIn: { status: "pending", time: "—" }, mood: "😊" },
];

export const announcements = [
  { id: 1, type: "Geral", unit: "Todas", message: "Reunião geral nesta sexta às 19h, presença obrigatória.", date: "há 2h", color: "bg-gold/20 text-gold border-gold/40" },
  { id: 2, type: "Urgente", unit: "Birigui", message: "Manutenção elétrica amanhã das 06h às 07h.", date: "há 1d", color: "bg-destructive/20 text-destructive border-destructive/40" },
  { id: 3, type: "Evento", unit: "Penápolis", message: "Workshop de degradê com Master Barber dia 15.", date: "há 3d", color: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
];

export const feedbacks = [
  { id: 1, pro: "Lucas", type: "Positivo", message: "Excelente atendimento ao cliente VIP nesta semana!", color: "bg-success/20 text-success border-success/40" },
  { id: 2, pro: "Luiz Felipe", type: "Melhoria", message: "Atenção à pontualidade, atrasos recorrentes.", color: "bg-warning/20 text-warning border-warning/40" },
  { id: 3, pro: "Karitta", type: "Técnico", message: "Aprimorar técnica de visagismo facial.", color: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
];

export const awards = [
  { id: 1, type: "Barbeiro do Mês", winner: "Thiago", desc: "Maior número de clientes em Outubro", active: true },
  { id: 2, type: "Atendimento 5 Estrelas", winner: "Larissa", desc: "Avaliação perfeita do mês", active: true },
  { id: 3, type: "Destaque Visagismo", winner: "Lucas", desc: "Trabalho referência da unidade Birigui", active: false },
];

export const reviews = [
  { id: 1, pro: "Thiago", stars: 5, comment: "Melhor corte da minha vida, atendimento impecável!" },
  { id: 2, pro: "Lucas", stars: 5, comment: "Profissional sensacional, recomendo demais." },
  { id: 3, pro: "Karitta", stars: 4, comment: "Muito atenciosa e capricha no acabamento." },
  { id: 4, pro: "Diego", stars: 5, comment: "Sempre um show, virei cliente fiel." },
];

export const library = [
  { title: "Degradê", count: 12, icon: "Scissors" },
  { title: "Barba", count: 8, icon: "Wind" },
  { title: "Visagismo", count: 6, icon: "Eye" },
  { title: "Kids", count: 5, icon: "Baby" },
  { title: "Prótese Capilar", count: 4, icon: "Layers" },
  { title: "Black Bear", count: 7, icon: "Crown" },
  { title: "Atendimento", count: 10, icon: "Smile" },
  { title: "Clube Sir Alfred", count: 3, icon: "Star" },
];

export const pops = [
  { code: "POP 001", title: "Atendimento ao Cliente", badge: "Obrigatório", color: "bg-success/20 text-success border-success/40", desc: "Padrão de excelência no recebimento e tratamento de cada cliente.", steps: ["Recepcionar com cumprimento Sir Alfred", "Oferecer bebida de cortesia", "Confirmar serviço e preferências", "Executar com técnica e atenção", "Despedir-se agradecendo a visita"] },
  { code: "POP 002", title: "Higienização de Equipamentos", badge: "Novo", color: "bg-warning/20 text-warning border-warning/40", desc: "Protocolo de limpeza e esterilização entre atendimentos.", steps: ["Borrifar álcool 70% nas lâminas", "Escovar resíduos do pente", "Desinfecção UV por 5 minutos", "Trocar toalhas a cada cliente", "Registrar limpeza no checklist"] },
  { code: "POP 003", title: "Clube de Assinaturas", badge: "Clube", color: "bg-blue-500/20 text-blue-400 border-blue-500/40", desc: "Atendimento exclusivo aos membros do Clube Sir Alfred.", steps: ["Confirmar status no app", "Oferecer benefícios do plano", "Priorizar agenda do membro", "Brinde mensal exclusivo", "Atualizar pontuação do clube"] },
  { code: "POP 004", title: "Atendimento Kids", badge: "Kids", color: "bg-purple-500/20 text-purple-400 border-purple-500/40", desc: "Cuidados especiais para o público infantil.", steps: ["Acolher criança e responsável", "Usar capa temática divertida", "Explicar cada etapa do corte", "Pausa para brincadeira se necessário", "Entregar brinde Sir Alfred Kids"] },
];

export const updates = [
  { who: "Thiago", what: "bateu meta mensal 🎯", when: "há 10 min" },
  { who: "Lucas", what: "recebeu avaliação 5★", when: "há 30 min" },
  { who: "Diego", what: "publicou novo aviso", when: "há 1h" },
  { who: "Karitta", what: "concluiu treinamento de visagismo", when: "há 2h" },
];

export const birthdays = [
  { name: "Karitta", unit: "Birigui", days: 4 },
  { name: "Rocha", unit: "Penápolis", days: 12 },
  { name: "Lucas", unit: "Birigui", days: 21 },
];

export const personalHistory = [
  { type: "award", icon: "Trophy", title: "Barbeiro do Mês", date: "Out 2026", color: "text-gold" },
  { type: "goal", icon: "Target", title: "Meta de 50 clientes batida", date: "Out 2026", color: "text-success" },
  { type: "feedback", icon: "MessageCircle", title: "Feedback positivo do gestor", date: "Set 2026", color: "text-blue-400" },
  { type: "training", icon: "GraduationCap", title: "Treinamento Visagismo concluído", date: "Set 2026", color: "text-purple-400" },
  { type: "award", icon: "Trophy", title: "Atendimento 5 Estrelas", date: "Ago 2026", color: "text-gold" },
];
