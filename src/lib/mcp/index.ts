import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get-my-profile";
import listAnnouncements from "./tools/list-announcements";
import listMyIdeas from "./tools/list-my-ideas";
import submitIdea from "./tools/submit-idea";
import logPulse from "./tools/log-pulse";
import myPerformance from "./tools/my-performance";

// Direct Supabase issuer (never the .lovable.cloud proxy).
// Inlined by Vite at build time — kept import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "sir-alfred-equipe-mcp",
  title: "Sir Alfred Equipe",
  version: "0.1.0",
  instructions:
    "Ferramentas para a equipe da barbearia Sir Alfred: perfil do usuário, avisos, Caixa de Ideias, pulso do dia e histórico de desempenho. Todas as ações respeitam as permissões (RLS) do usuário autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProfile, listAnnouncements, listMyIdeas, submitIdea, logPulse, myPerformance],
});
