# Arquitetura

```
 iPhone (Expo / React Native)                         Backend (Node.js + Fastify)                 Serviços
 ┌───────────────────────────────┐   HTTPS + JWT    ┌──────────────────────────────────┐
 │ Voice Engine                  │ ───────────────▶ │ Authentication (Supabase JWT)    │──▶ Supabase Auth
 │  · SFSpeechRecognizer (pt-BR) │                  │ AI Orchestrator (laço de agente) │──▶ Claude (Anthropic)
 │  · AVSpeechSynthesizer / MP3  │ ◀─────────────── │ Tool Registry (zod + risco)      │
 │ UI holográfica (Reanimated)   │   resposta +     │ Memory Service (UserStore)       │──▶ PostgreSQL (RLS)
 │ Face ID · sessão criptografada│   eventos de     │ Usage/Budget · Audit log         │
 │ Telas: Jarvis, Painel, ...    │   ferramentas    │ TTS opcional                     │──▶ ElevenLabs
 └───────────────────────────────┘                  └──────────────────────────────────┘
```

## Módulos

| Módulo pedido | Onde está | Fase 1 |
|---|---|---|
| Voice Engine | `apps/mobile/src/voice/`, `src/logic/voiceMachine.ts` | ✅ |
| AI Orchestrator | `apps/server/src/agent/orchestrator.ts` | ✅ |
| Tool Registry | `apps/server/src/tools/registry.ts` | ✅ |
| Memory Service | `apps/server/src/store/` + tabela `jarvis_memories` | ✅ |
| Integrations Service | Interface de ferramentas pronta; conectores reais na Fase 2/4 | ⏳ |
| Automation Engine | Fase 4 (agendador no backend + push) | ⏳ |
| Notifications Service | Fase 2 | ⏳ |
| Authentication | Supabase Auth + `apps/server/src/auth.ts` + Face ID no app | ✅ |
| Business Dashboard | `apps/mobile/src/app/(tabs)/dashboard.tsx` (organizacional) | ✅ parcial |
| Settings | `apps/mobile/src/app/(tabs)/settings.tsx` + `PATCH /v1/settings` | ✅ |

## Fluxo de um comando de voz

1. Toque no orbe → permissão de microfone/fala → `ExpoSpeechRecognitionModule.start({ lang: "pt-BR", interimResults: true })`.
2. Parciais aparecem na tela; o volume (`volumechange`) anima as ondas.
3. Fim da fala: resultado final do iOS, ou ~1,6 s sem mudança no texto (`stop()` força o resultado final).
4. “Jarvis, …” → a palavra de ativação é removida; “é só isso / pode parar” encerra sem chamar a IA.
5. `POST /v1/chat` com o texto e o fuso do aparelho.
6. O orquestrador: verifica o limite diário → carrega histórico (20 mensagens) e até 5 memórias relevantes →
   chama o Claude com as ferramentas → valida cada chamada com zod → executa (`read`/`write`) ou cria uma
   **ação pendente** (`confirm`) → repete até a resposta final (máx. 6 iterações) → salva mensagens,
   auditoria e consumo.
7. O app mostra a resposta, os eventos das ferramentas (EXECUTADO / PENDENTE / FALHOU) e fala o texto.
8. Na conversa contínua, volta a ouvir.

## Como adicionar uma ferramenta (sem mexer no núcleo)

```ts
// apps/server/src/tools/agenda.ts (exemplo para a Fase 2)
export const createEventTool = defineTool({
  name: "criar_evento",
  label: "Evento na agenda",
  description: "Cria um evento no Google Agenda do usuário.",
  input: z.object({ titulo: z.string(), inicio: z.string().datetime({ local: true }), duracaoMin: z.number().int() }),
  risk: "confirm",                         // só executa após o usuário confirmar no app
  describe: (i) => `Criar "${i.titulo}" em ${i.inicio}`,
  execute: async (i, ctx) => { /* chama a API oficial; retorna sucesso SOMENTE com resposta positiva */ },
});
// e registre em createDefaultRegistry()
```

## API do backend

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Estado do servidor, IA e voz premium (sem login) |
| GET | `/v1/me` | Perfil |
| PATCH | `/v1/settings` | Nome de tratamento, memória on/off, fuso, limite diário |
| POST | `/v1/chat` | Envia uma mensagem (voz ou texto) |
| GET | `/v1/conversations` · `/v1/conversations/:id/messages` | Histórico |
| DELETE | `/v1/conversations/:id` | Apaga conversa |
| GET/POST | `/v1/memories` | Lista/busca (`q`, `category`, `space`) e cria |
| PATCH/DELETE | `/v1/memories/:id` | Corrige / apaga |
| GET | `/v1/export` | Exporta todos os dados (JSON) |
| GET | `/v1/actions/pending` | Ações aguardando confirmação |
| POST | `/v1/actions/:id/confirm` · `/reject` | Confirma (executa) ou cancela |
| GET | `/v1/audit` · `/v1/usage` | Auditoria e consumo |
| POST | `/v1/tts` | Áudio MP3 da voz premium (se configurada) |

## Banco de dados

Tabelas (todas com RLS `user_id = auth.uid()`): `jarvis_profiles`, `jarvis_conversations`, `jarvis_messages`,
`jarvis_memories`, `jarvis_pending_actions`, `jarvis_action_log` (somente inserir/ler), `jarvis_usage`
(somente inserir/ler). O papel `anon` não tem acesso.

## Modelo de IA

- Padrão: `claude-opus-5-5` com esforço `low` (respostas curtas de voz), via `@anthropic-ai/sdk`.
- Configurável por `AI_MODEL` (ex.: `claude-sonnet-5-5`, `claude-haiku-5-5` para reduzir custo) e `AI_EFFORT`.
- `AI_FALLBACKS=true` habilita o fallback no servidor da Anthropic quando o modelo recusa por política.
- O provedor fica atrás da interface `AIProvider` (`apps/server/src/ai/types.ts`); outro provedor pode ser
  adicionado implementando essa interface.
