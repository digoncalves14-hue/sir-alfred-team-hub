# JARVIS AI — assistente pessoal por voz para iPhone

Assistente pessoal em português, com voz, memória persistente e ações autorizadas.
App iOS (Expo/React Native) + backend Node.js (TypeScript) + Supabase (PostgreSQL com RLS) + Claude (Anthropic).

> **Status: Fases 1 (MVP), 2 (Produtividade) e 3 (Integração iOS) implementadas e verificadas no ambiente de desenvolvimento.**
> Ainda **não** foram instaladas em um iPhone físico nem testadas contra as APIs reais do Google: isso exige a
> sua conta Apple Developer, Supabase, chave da IA e um projeto no Google Cloud
> (veja [Passo a passo](#passo-a-passo-para-rodar-no-iphone) e [`docs/GOOGLE.md`](docs/GOOGLE.md)).

---

## O que existe hoje

| Recurso | Situação | Observação |
|---|---|---|
| App iOS com interface holográfica (orbe animado, anéis, ondas) | ✅ Implementado | Animações diferentes para ouvindo / processando / falando |
| Login (e-mail e senha, Supabase Auth) | ✅ Implementado | Sessão criptografada (AES-256 + Keychain) |
| Bloqueio por Face ID | ✅ Implementado | Opcional em Ajustes; protege o acesso local |
| Conversa por voz em pt-BR | ✅ Implementado | Reconhecimento da Apple, transcrição em tempo real, ondas pelo volume real do microfone |
| Respostas faladas | ✅ Implementado | Voz nativa do iPhone (grátis); voz premium ElevenLabs opcional |
| Interromper a fala do Jarvis | ✅ Implementado | Toque no orbe enquanto ele fala |
| Conversa contínua | ✅ Implementado | Volta a ouvir após responder; 2 silêncios seguidos encerram; “obrigado Jarvis, é só isso” encerra |
| Palavra “Jarvis” no início da fala | ✅ Implementado | É removida do comando. **Não** há escuta permanente (ver limitações) |
| IA real com ferramentas (function calling validado) | ✅ Implementado | Claude via SDK oficial; entradas validadas com zod antes de executar |
| Confirmação explícita para exclusões | ✅ Implementado | Vira “ação pendente” com cartão Confirmar/Cancelar; expira em 15 min |
| Histórico de conversas | ✅ Implementado | Listar, abrir, apagar |
| Memória persistente | ✅ Implementado | Salvar, buscar, corrigir, apagar, desativar, exportar (JSON). Separada por categoria e espaço |
| Bloqueio de dados sensíveis na memória | ✅ Implementado | Senhas, cartões, CPF, chaves de API são recusados no servidor |
| Registro de ações (auditoria) | ✅ Implementado | Imutável para o usuário (só inserir/ler) |
| Controle de custos | ✅ Implementado | Estimativa por requisição, painel de consumo, limite diário configurável |
| Painel pessoal + espaços empresariais | ✅ Organizacional | Sir Alfred, Black Bear, Barton, Alfie & Fred, Educação: organizam memórias. **Sem dados de negócio conectados** |
| **Siri, Atalhos, Spotlight e Botão de Ação** (App Intents) | ✅ Fase 3 | "Conversar com Jarvis", resumo do dia, agenda, registrar tarefa — sem configuração manual. Ver [`docs/IOS.md`](docs/IOS.md) |
| Siri responde sem abrir o app | ✅ Fase 3 | Chave do aparelho de escopo restrito, no Keychain, revogável; exige backend HTTPS |
| Calendário e Lembretes do iPhone | ✅ Fase 3 | Leitura como contexto (com permissão); criar evento/lembrete **após confirmação** |
| Ligar, SMS, WhatsApp, e-mail, Mapas, links | ✅ Fase 3 | Abre o app de destino com o texto pronto (link oficial `wa.me`); contatos buscados no próprio iPhone |
| Localização aproximada | ✅ Fase 3 | Cidade/região, só com o app aberto |
| Compartilhar para o Jarvis | ✅ Fase 3 | Via atalho "Salvar na memória do Jarvis" na Folha de Compartilhamento |
| **Google Agenda** (OAuth, escopo mínimo de eventos) | ✅ Fase 2 | Consultar, apontar conflitos, verificar disponibilidade; criar/reagendar/cancelar **só após confirmação** |
| “Organize minha agenda de amanhã” | ✅ Fase 2 | Apenas **propõe** — nenhuma alteração sem pedido explícito |
| **Gmail** | ✅ Fase 2 | Buscar, ler, resumir, prioritários, rascunhos; **enviar só após confirmação**; nunca apaga |
| Tarefas e lembretes | ✅ Fase 2 | Por voz ou na tela Hoje; prazo, prioridade, espaço, lembrete com push |
| Resumo diário | ✅ Fase 2 | Push no horário escolhido + “o que temos para hoje?” por voz |
| Notificações push | ✅ Fase 2 | Lembretes de tarefas, resumo diário e aviso N min antes de reuniões, com o app fechado |
| Agendador no backend | ✅ Fase 2 | Sem duplicar avisos (deduplicação no banco); alternativa por cron externo |
| App Intents, Siri nativa, calendário/lembretes do iPhone | ⏳ Fase 3 | |
| Conectores empresariais, relatórios, automações agendadas | ⏳ Fase 4 | |
| Menor latência (streaming), memória semântica, rotinas | ⏳ Fase 5 | |

Nada é simulado: se uma integração não existe, o Jarvis informa isso; se uma ação não foi confirmada
pela ferramenta, ele não diz que foi feita.

---

## Estrutura

```
jarvis-ai/
├── apps/
│   ├── mobile/                 # App iOS (Expo SDK 58, Expo Router, TypeScript)
│   │   ├── src/app/            # Telas: login, Jarvis, Hoje, Histórico, Memória, Ajustes
│   │   ├── src/voice/          # Voice Engine: reconhecimento + síntese
│   │   ├── src/logic/          # Máquina de estados da voz, palavra de ativação (testadas)
│   │   ├── src/components/     # Orbe holográfico, cartões, chat
│   │   ├── src/providers/      # Autenticação + Face ID, preferências
│   │   ├── src/lib/            # Cliente da API, Supabase, armazenamento seguro, recursos do iPhone
│   │   ├── native/ios/         # App Intents (Swift) — Siri, Atalhos, Botão de Ação
│   │   ├── plugins/            # Config plugin que injeta os App Intents no alvo do app
│   │   └── modules/jarvis-native/  # Módulo Expo (Swift): Keychain + ponte de intents
│   └── server/                 # Backend Node.js (Fastify)
│       ├── src/agent/          # AI Orchestrator (laço de agente), prompt, fala
│       ├── src/ai/             # Provedor de IA (interface neutra + Claude), preços
│       ├── src/tools/          # Tool Registry + ferramentas (data/hora, memória)
│       ├── src/store/          # Memory Service sobre Supabase (RLS)
│       ├── src/security/       # Anti prompt-injection, dados sensíveis
│       ├── src/tts/            # Voz premium opcional (ElevenLabs)
│       ├── src/google/         # OAuth (PKCE), Google Agenda, Gmail
│       ├── src/push/           # Notificações push (Expo → APNs)
│       ├── src/scheduler/      # Lembretes, resumo diário, avisos de reunião
│       └── test/               # Testes unitários, de API e de integração (RLS)
├── packages/shared/            # Contratos (zod) usados pelo app e pelo servidor
├── supabase/migrations/        # Migração SQL com Row Level Security
├── docs/                       # Arquitetura, custos, limitações e roadmap
└── Dockerfile.server           # Imagem do backend
```

Detalhes: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) · Google: [`docs/GOOGLE.md`](docs/GOOGLE.md) · iPhone/Siri: [`docs/IOS.md`](docs/IOS.md) · Custos: [`docs/CUSTOS.md`](docs/CUSTOS.md) ·
Limitações e próximas fases: [`docs/LIMITACOES-E-ROADMAP.md`](docs/LIMITACOES-E-ROADMAP.md)

---

## Passo a passo para rodar no iPhone

### O que você precisa providenciar

Nunca envie senhas ou chaves pelo chat. Cada item abaixo é colado **somente** nos arquivos `.env` locais
ou nos painéis dos serviços.

| # | Item | Onde obter | Custo |
|---|---|---|---|
| 1 | Projeto Supabase (URL + chave **publishable/anon**) | supabase.com → New project → Project Settings → API | Gratuito para começar |
| 2 | Chave da API Claude | platform.claude.com → API Keys (com créditos) | Pago por uso |
| 3 | Conta Expo | expo.dev (para o EAS Build) | Gratuito (com limite de builds) |
| 4 | **Apple Developer Program** | developer.apple.com/programs | US$ 99/ano — necessário para instalar no iPhone via EAS/TestFlight |
| 5 | (Opcional) ElevenLabs: API key + ID de uma voz masculina pt-BR | elevenlabs.io | Plano pago conforme uso |
| 6 | Um lugar para hospedar o backend (ou seu computador na mesma rede Wi-Fi para testes) | Render, Railway, Fly.io… | Gratuito a ~US$ 7/mês |
| 7 | (Fase 2) Supabase **service_role** + chave de criptografia + **cliente OAuth iOS do Google** | Ver [`docs/GOOGLE.md`](docs/GOOGLE.md) | Gratuito |

### 1. Banco de dados (Supabase)

1. Crie um projeto (recomendo um projeto **separado** do Sir Alfred Team Hub).
2. Abra **SQL Editor** e execute, nesta ordem, `supabase/migrations/20261103000000_jarvis_phase1.sql`,
   `20261104000000_jarvis_phase2.sql` e `20261105000000_jarvis_phase3.sql`.
   (Ou, com a Supabase CLI: `supabase link` e `supabase db push` dentro de `jarvis-ai/`.)
3. Em **Authentication → Providers → Email**, mantenha e-mail/senha ativado. Para uso pessoal,
   você pode desativar “Confirm email” ou confirmar pelo link enviado.
4. Recomendado: depois de criar sua conta no app, em **Authentication → Settings**, desative novos cadastros
   (“Allow new users to sign up”) para que só você use o seu Jarvis.

### 2. Backend

```bash
cd jarvis-ai
npm install
cp apps/server/.env.example apps/server/.env   # preencha SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY
npm run dev:server                              # http://0.0.0.0:8787
curl http://localhost:8787/health               # deve mostrar "configured": true para a IA
```

Para o iPhone acessar o servidor do seu computador, use o IP local (ex.: `http://192.168.0.10:8787`) com
ambos na mesma rede Wi-Fi. Para uso no dia a dia, publique o backend (Docker):

```bash
docker build -f Dockerfile.server -t jarvis-server .
docker run -p 8787:8787 --env-file apps/server/.env jarvis-server
```

Em Render/Railway/Fly.io: aponte para `jarvis-ai/Dockerfile.server`, configure as mesmas variáveis do `.env`
no painel do serviço e use a URL **HTTPS** gerada no app.

**Lembretes, resumo diário e avisos de reunião** dependem do agendador do backend, que precisa estar
**sempre ligado** (planos gratuitos que "dormem" não servem). Alternativa: defina `CRON_SECRET` e configure um
cron gratuito (ex.: cron-job.org) para chamar a cada minuto:
`POST https://SEU-BACKEND/internal/cron/tick` com o cabeçalho `x-cron-secret: <CRON_SECRET>`.

### 3. App (development build)

O app usa módulos nativos (reconhecimento de fala, Face ID), então **não roda no Expo Go**: é preciso um
*development build* instalado no iPhone.

```bash
cd jarvis-ai/apps/mobile
cp .env.example .env            # EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_API_URL
npx eas-cli@latest login
npx eas-cli@latest init         # vincula o projeto à sua conta Expo
npx eas-cli@latest device:create   # registra o seu iPhone (abra o link no iPhone)
npx eas-cli@latest build --profile development --platform ios
```

- Troque `ios.bundleIdentifier` em `app.json` (`com.digoncalves.jarvisai`) se quiser outro identificador.
- O EAS pede login da Apple e cria certificados/perfis automaticamente.
- Ao terminar, abra o link/QR do build no iPhone para instalar. No iOS 16+, ative
  **Ajustes → Privacidade e Segurança → Modo de Desenvolvedor**.
- Inicie o servidor de desenvolvimento: `npm run start` (em `apps/mobile`) e abra o app instalado.
  Ele aparece com o ícone próprio do JARVIS AI.

As variáveis `EXPO_PUBLIC_*` são embutidas no app. Para builds sem o servidor de desenvolvimento
(`preview`/`production`), cadastre-as também em **expo.dev → projeto → Environment variables**.

**Alternativa com Mac + Xcode:** `npx expo run:ios --device` instala direto via cabo (um Apple ID gratuito
funciona, mas o app expira em 7 dias).

### 4. TestFlight (instalação estável, sem servidor de desenvolvimento)

```bash
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest submit --platform ios
```

Depois, no App Store Connect, adicione-se como testador interno e instale pelo app TestFlight.

### 5. Primeiro uso

1. Crie sua conta no app (e-mail e senha) e entre.
2. Toque no orbe, permita **Microfone** e **Reconhecimento de Fala**.
3. Diga: “Jarvis, lembre que decidimos lançar a pomada matte da Black Bear em março.”
4. Depois: “Qual foi nossa última decisão sobre a Black Bear?”
5. Em **Ajustes**: defina como ele deve chamar você, escolha a voz (baixe uma voz pt-BR “Aprimorada” no iPhone
   para soar mais natural), ative o Face ID e ajuste o limite diário de custo.
6. Fase 2: em **Ajustes → Integrações**, conecte o Google; em **Notificações**, ative o push e escolha o horário
   do resumo diário. Para push, o projeto precisa estar vinculado ao EAS (`npx eas-cli@latest init`).

### 6. Siri, Atalhos e Botão de Ação

Com um build da Fase 3 instalado, as ações do Jarvis já aparecem na Siri e no app Atalhos:

- **Siri:** “E aí, Siri, conversar com Jarvis” abre o app já ouvindo; “Resumo do dia no Jarvis” responde sem abrir
  (depois de ativar em Ajustes → Siri, Atalhos e Botão de Ação; exige backend com HTTPS).
- **Botão de Ação (iPhone 16 Pro Max):** Ajustes → Botão de Ação → Atalho → JARVIS AI → Conversar.

Detalhes, frases e privacidade: [`docs/IOS.md`](docs/IOS.md). O link `jarvis://?ouvir=1` continua funcionando.

---

## Testes e verificações

```bash
cd jarvis-ai
npm run typecheck          # shared + server + mobile
npm test                   # 115 testes: orquestrador, ferramentas, Google (simulado), agendador, iPhone/Siri, API, segurança, voz
npm run db:test:up         # sobe um PostgreSQL local descartável
npm run test:integration   # aplica as migrações reais e testa o RLS (14 testes)
npm run db:test:down
npm run verify:mobile      # typecheck + bundle iOS (Metro/Hermes)
```

O workflow `.github/workflows/jarvis-ai.yml` roda tudo isso no GitHub Actions a cada push.

---

## Segurança (resumo)

- A chave da IA (e da ElevenLabs) fica **somente** no backend; o app só tem valores públicos.
- O backend age com o **token do próprio usuário** no Supabase → o **RLS** do banco isola os dados
  (não usa `service_role`). O papel anônimo não acessa nenhuma tabela.
- Sessão do app criptografada (AES-256) com chave no Keychain; Face ID opcional.
- Ferramentas com níveis de risco; exclusões/envios exigem confirmação explícita e expiram.
- Conteúdo de dados (memórias e, nas próximas fases, e-mails e agenda) entra delimitado como dado não confiável
  para mitigar prompt injection.
- Limite de requisições por minuto, limite diário de custo, logs estruturados sem tokens nem conteúdo das conversas.
- Dados sensíveis (senhas, cartões, CPF, chaves) são recusados na memória.
- O Jarvis não executa operações financeiras.
- Tokens do Google: cifrados (AES-256-GCM) no backend, numa coluna que o usuário logado não lê; OAuth com PKCE
  e escopos mínimos; revogação pelo app. O agendador usa a service_role **somente no backend**, filtrando por usuário.
- Siri em segundo plano: chave por aparelho (só o hash no servidor), limitada a 4 ações, revogável. Ações no iPhone
  (lembrete, evento, ligação, mensagens) exigem confirmação e só contam como feitas com o retorno real do aparelho.
