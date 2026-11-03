# Limitações conhecidas e próximas fases

## O que foi verificado e o que não foi

**Verificado neste ambiente (Linux, sem iPhone) — Fases 1 a 4:**
- Verificação de tipos de todo o projeto (shared, server, mobile).
- 141 testes automatizados (Fase 4: leitura de planilhas brasileiras, indicadores de vendas/estoque/pedidos/
  cronograma/metas, indicadores do Hub, OAuth do Hub com rotação de refresh token, automações uma vez por período;
  Fase 3: chaves de aparelho, endpoints da Siri, ações executadas no iPhone,
  contexto do aparelho, links de ligação/SMS/WhatsApp/e-mail): orquestrador (ferramentas, confirmação, expiração, limites, recusa), API HTTP
  (autenticação, isolamento entre usuários, memória, exportação, ações, integrações, tarefas, push, cron),
  segurança, voz e palavra de ativação; Fase 2 com simulação das APIs do Google e do Expo Push exercitando os
  clientes reais (OAuth/PKCE, criar/reagendar/cancelar evento, buscar/ler/rascunhar/enviar e-mail, agendador).
- 16 testes de integração aplicando as migrações reais em PostgreSQL 16 e checando o RLS (inclusive que o
  usuário não lê o token cifrado nem o hash das chaves de aparelho, e que um lembrete só é reivindicado uma vez).
- Fase 3: `expo prebuild` gera o projeto com os App Intents no alvo principal (fase Sources), nome alternativo
  "Jarvis", região pt-BR, iOS 17, permissões de Calendário/Lembretes/Contatos/Localização em português, e o
  módulo nativo local é encontrado pelo autolinking. O plugin é idempotente (duas execuções, uma única referência).
- Bundle iOS completo gerado pelo Metro/Hermes (`expo export --platform ios`).
- Projeto nativo iOS gerado (`expo prebuild`) com as permissões de microfone, fala e Face ID, o esquema
  `jarvis://`, o esquema de retorno do Google, o direito de push (`aps-environment`) e **sem** modos de segundo plano.
- Backend iniciado e respondendo (`/health`, rejeição sem login), inclusive com instalação de produção.

**Ainda não verificado (exige seus recursos):**
- **Compilação do código Swift** (App Intents e módulo nativo): este ambiente é Linux e o framework AppIntents só
  existe no Xcode/macOS. O código segue a API pública da Apple, mas a primeira compilação real acontece no EAS Build
  (ou no seu Mac). Se algo falhar ali, o log do build aponta a linha e eu corrijo.
- Execução no iPhone físico (reconhecimento de voz, Face ID, áudio, animações a 60/120 fps).
- Chamadas reais ao Claude, ao Supabase, à ElevenLabs, ao Google e ao Expo Push (exigem suas chaves/contas).
  Os formatos de requisição seguem a documentação pública dessas APIs e foram testados contra simulações.
- `expo-doctor`: 18 de 20 checagens passaram; as 2 restantes precisam de acesso à internet da Expo, bloqueado aqui.

## Limitações conhecidas

### Fase 4
- **Hub:** a conexão real depende de cadastrar o cliente OAuth do Jarvis no Supabase do Hub (script incluso). O
  formato das tabelas do Hub foi lido deste repositório; se o Hub mudar o esquema, o conector precisa acompanhar.
- **Período do Hub:** usa o último `period_label` lançado pela gestão; o Jarvis não recalcula períodos.
- **Black Bear, Barton, Alfie & Fred, Educação:** dados via planilha até existir API oficial/autorizada de cada sistema.
- **Planilhas:** até 1.000 linhas por intervalo (ajustável no intervalo); fórmulas são lidas pelo valor exibido.
- **Relatórios** são textos determinísticos; análises mais elaboradas acontecem quando você conversa com o Jarvis.

### Fase 3
- **Siri em segundo plano exige backend HTTPS** (decisão de segurança para a chave do aparelho).
- **Frases da Siri** precisam conter o nome do app ("Jarvis"); o reconhecimento das frases em português deve ser
  confirmado no aparelho. Se a Siri não reconhecer alguma, o atalho continua disponível no app Atalhos.
- **Intents em segundo plano** respondem com Google Agenda, tarefas e memória do Jarvis; eventos só do Calendário do
  iPhone aparecem quando você pergunta com o app aberto.
- **Folha de Compartilhamento:** via um atalho do usuário (não há Share Extension dedicada).
- **Calendário do iPhone:** eventos são criados no calendário padrão; edição/cancelamento de eventos nativos ficam para depois.

### Fase 2
- **Google em modo "Em teste" expira em 7 dias** — publique a tela de consentimento como "Em produção" (uso
  pessoal, com aviso de app não verificado). Ver `docs/GOOGLE.md`.
- **Lembretes dependem do servidor ligado** (ou de um cron externo chamando `/internal/cron/tick`). Com o servidor
  desligado, os avisos atrasam; o resumo diário não é enviado se o atraso passar de 3 horas.
- **Push só em iPhone físico** e após `eas init` (o token de push depende do projeto EAS).
- **Agenda:** somente a agenda principal (`primary`). Outras agendas e recorrências complexas ficam para depois.
- **Gmail:** lê até ~6.000 caracteres de cada e-mail; anexos não são abertos.
- **Calendário/Lembretes nativos do iPhone (EventKit)** ainda não — Fase 3.

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

### Fase 2 — Produtividade ✅ (implementada)
Google Agenda, Gmail, tarefas e lembretes, resumo diário, notificações push e agendador. Detalhes no README.

### Fase 3 — Integração iOS ✅ (implementada)
App Intents (Siri, Atalhos, Spotlight, Botão de Ação), respostas da Siri em segundo plano, Calendário/Lembretes,
Contatos, localização, ligações/mensagens/WhatsApp por links oficiais. Detalhes em `docs/IOS.md`.

### Fase 4 — Negócios ✅ (implementada)
Conectores (Sir Alfred Team Hub e Google Planilhas), aba Negócios, indicadores, relatórios e automações
controladas pelo usuário. Próximos conectores, quando houver API autorizada: loja da Black Bear (ex.: Shopify,
Nuvemshop), Barton, AppBarber.
- WhatsApp: primeiro, abrir conversas com mensagem pronta (`whatsapp://send`), sem automação não oficial;
  WhatsApp Business Platform apenas quando configurado oficialmente.

### Fase 5 — Assistente avançado
- Streaming de texto e voz para menor latência; barge-in por voz.
- Memória semântica (pgvector) e resumo automático de conversas longas.
- Tarefas em múltiplas etapas, rotinas personalizadas e limites de custo por recurso.
