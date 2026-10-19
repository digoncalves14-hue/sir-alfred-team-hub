import { z } from "zod";

/** Textos sugeridos pela IA para publicação (seção 12). Sempre revisáveis pelo usuário. */
export const ContentSuggestionsSchema = z.object({
  youtube_titles: z.array(z.string()).describe("3 opções de título para YouTube"),
  youtube_description: z.string(),
  instagram_caption: z.string(),
  facebook_caption: z.string(),
  hashtags: z.array(z.string()).describe("8 a 15 hashtags relevantes, com #"),
  thumbnail_ideas: z.array(z.string()).describe("3 ideias de capa/thumbnail"),
  call_to_action: z.string(),
  opening_ideas: z.array(z.string()).describe("2 sugestões de abertura (gancho)"),
  closing_ideas: z.array(z.string()).describe("2 sugestões de encerramento"),
});
export type ContentSuggestions = z.infer<typeof ContentSuggestionsSchema>;
