import type { EditStyleId } from "./styles";

/**
 * Marcas iniciais. Somente dados textuais e cores: as logos oficiais NUNCA são
 * geradas — o usuário precisa enviar o arquivo oficial em "Minhas Marcas".
 */
export interface BrandSeed {
  slug: string;
  name: string;
  segment: string;
  tone: string;
  contentTypes: string[];
  colors: string[];
  fonts: string[];
  defaultStyleId: EditStyleId;
  notes?: string;
}

export const BRAND_SEEDS: BrandSeed[] = [
  {
    slug: "sir-alfred-barbearia",
    name: "Sir Alfred Barbearia",
    segment: "Barbearia masculina premium",
    tone: "Sofisticada e elegante",
    contentTypes: ["Cortes masculinos", "Barba", "Transformação visual", "Experiência do cliente"],
    colors: ["#0B0B0C", "#D4AF37"],
    fonts: ["Montserrat"],
    defaultStyleId: "premium",
  },
  {
    slug: "black-bear",
    name: "Black Bear",
    segment: "Cosméticos masculinos",
    tone: "Força, presença e autenticidade",
    contentTypes: ["Comerciais de produtos", "Demonstrações", "Tutoriais", "Campanhas"],
    colors: ["#0B0B0C", "#2B2B2E", "#5A3B26", "#A8893E"],
    fonts: ["Montserrat"],
    defaultStyleId: "product_commercial",
  },
  {
    slug: "sir-alfred-kids",
    name: "Sir Alfred Kids",
    segment: "Universo infantil",
    tone: "Divertida, alegre, lúdica e musical",
    contentTypes: ["Vídeos infantis", "Eventos", "Músicas", "Histórias"],
    colors: ["#3B1F7A", "#FF6FB5", "#FFD54A", "#4FC3F7"],
    fonts: ["Fredoka"],
    defaultStyleId: "kids_fun",
    notes: "Mascotes: Alfie e Fred (usar apenas artes oficiais enviadas).",
  },
  {
    slug: "barton",
    name: "Barton",
    segment: "Tecnologia e gestão para barbearias",
    tone: "Tecnológica e profissional",
    contentTypes: ["Apresentação de funcionalidades", "Tutoriais", "Publicidade do sistema"],
    colors: ["#0E1116", "#3D7BFF", "#E6EAF0"],
    fonts: ["Open Sans"],
    defaultStyleId: "educational",
  },
  {
    slug: "genesis-barber",
    name: "Genesis Barber",
    segment: "Cursos e formação profissional para barbeiros",
    tone: "Didática, inspiradora e profissional",
    contentTypes: ["Aulas", "Workshops", "Técnicas de corte", "Entrevistas", "Vídeos educacionais"],
    colors: ["#111111", "#C9A227", "#F2F2F2"],
    fonts: ["Montserrat"],
    defaultStyleId: "workshop_training",
  },
];
