# Limitações conhecidas e próximas fases

## O que foi verificado e o que não foi

**Verificado neste ambiente (Linux, sem iPhone):**
- Verificação de tipos de todo o projeto (shared, server, mobile).
- 62 testes automatizados: orquestrador (ferramentas, confirmação, expiração, limites, recusa), API HTTP
  (autenticação, isolamento entre usuários, memória, exportação, ações), segurança, voz e palavra de ativação.
- 7 testes de integração aplicando a migração real em PostgreSQL 16 e checando o RLS.
- Bundle iOS completo gerado pelo Metro/Hermes (`expo export --platform ios`).
- Projeto nativo iOS gerado (`expo prebuild`) com as permissões de microfone, fala e Face ID, o esquema
  `jarvis://` e **sem** modos de segundo plano.
- Backend iniciado e respondendo (`/health`, rejeição sem login), inclusive com instalação de produção.

**Ainda não verificado (exige seus recursos):**
- Execução no iPhone físico (reconhecimento de voz, Face ID, áudio, animações a 60/120 fps).
- Chamadas reais ao Claude, ao Supabase e à ElevenLabs (exigem suas chaves).
- `expo-doctor`: 18 de 20 checagens passaram; as 2 restantes precisam de acesso à internet da Expo, bloqueado aqui.

## Limitações conhecidas

- **Sem escuta permanente:** o iOS não permite que apps de terceiros fiquem ouvindo em segundo plano por uma
  palavra de ativação. O “Jarvis” funciona com o app aberto e o microfone ativo; para chamar com o app
  fechado, use a Siri ou o Botão de Ação com o atalho `jarvis://?ouvir=1`.
- **Interrupção por toque:** enquanto o Jarvis fala o microfone fica desligado (evita que ele ouça a própria voz).
  Para interromper, toque no orbe. Interrupção falando por cima (barge-in) fica para a Fase 5.
- **Ondas durante a fala:** quando ouvindo, as ondas seguem o volume real do microfone; quando o Jarvis fala, a
  animação é rítmica (a voz nativa do iOS não expõe a amplitude do áudio).
- **Reconhecimento de fala:** o iOS limita a duração de cada sessão (cerca de 1 minuto) e pode usar a rede
  da Apple. Falas longas devem ser divididas.
- **Voz masculina:** depende das vozes pt-BR instaladas no iPhone (escolha em Ajustes do app). Para uma voz
  masculina de alta qualidade garantida, use a voz premium (ElevenLabs) com um `ELEVENLABS_VOICE_ID` masculino.
- **Latência:** a resposta chega inteira (sem streaming). Streaming de texto e áudio fica para a Fase 5.
- **Busca na memória:** por palavras (sem acento, tolerante a flexões), não semântica. Embeddings/pgvector na Fase 5.
- **Datas relativas:** o Jarvis interpreta “amanhã às 15h” pelo fuso do aparelho, mas só criará eventos quando a
  agenda for integrada (Fase 2).
- **Exclusão de conta:** apagar a conta do Supabase remove todos os dados em cascata; ainda não há botão no app
  para isso (faça pelo painel do Supabase).

## Próximas fases

### Fase 2 — Produtividade
- Google Calendar via OAuth (escopos mínimos: `calendar.events`), tokens criptografados no backend.
  Ferramentas: consultar agenda, detectar conflitos, criar/reagendar (`confirm`), cancelar (`confirm`),
  “organize minha agenda de amanhã” → somente proposta.
- Gmail via OAuth (`gmail.readonly` + `gmail.send` só quando ativado): resumir, priorizar, rascunhar,
  enviar com confirmação. Conteúdo de e-mails passa pelo envelope anti-injeção.
- Tarefas e lembretes; resumo diário; notificações push (Expo Push/APNs) com agendador no backend.

### Fase 3 — Integração iOS
- Módulo nativo Swift com **App Intents**: “Conversar com Jarvis”, “Resumo do dia”, “Registrar tarefa”,
  “Consultar agenda” — aparecem no app Atalhos, na Siri e no Botão de Ação sem configuração manual.
- EventKit (calendário e lembretes do iPhone), Contatos, compartilhamento para o Jarvis (Share Extension),
  localização sob permissão.

### Fase 4 — Negócios
- Conectores autenticados por espaço (ex.: e-commerce da Black Bear, API autorizada do Barton), relatórios e
  automações agendadas, sempre com permissões revogáveis e separação de dados por espaço.
- WhatsApp: primeiro, abrir conversas com mensagem pronta (`whatsapp://send`), sem automação não oficial;
  WhatsApp Business Platform apenas quando configurado oficialmente.

### Fase 5 — Assistente avançado
- Streaming de texto e voz para menor latência; barge-in por voz.
- Memória semântica (pgvector) e resumo automático de conversas longas.
- Tarefas em múltiplas etapas, rotinas personalizadas e limites de custo por recurso.
