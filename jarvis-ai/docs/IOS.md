# Integração com o iPhone (Fase 3)

## Siri, Atalhos, Spotlight e Botão de Ação (App Intents)

O app traz **App Intents** nativos (Swift). Depois de instalar um build da Fase 3, eles aparecem
automaticamente — sem criar atalho manual — na Siri, no app **Atalhos**, no Spotlight e no **Botão de Ação**.

| Intent | Frases da Siri (exemplos) | Abre o app? | O que faz |
|---|---|---|---|
| Conversar com Jarvis | "Conversar com Jarvis", "Falar com Jarvis", "Chamar Jarvis" | Sim | Abre já ouvindo |
| Abrir Jarvis | "Abrir Jarvis" | Sim | Abre o app |
| Perguntar ao Jarvis | (pelo app Atalhos) | Sim | Abre e envia a pergunta |
| Resumo do dia | "Resumo do dia no Jarvis", "O que temos para hoje no Jarvis" | Não | A Siri fala o resumo (agenda + tarefas + e-mails) |
| Consultar agenda | "Consultar agenda no Jarvis" | Não | A Siri lê a agenda de hoje ou amanhã |
| Registrar tarefa | "Registrar tarefa no Jarvis" | Não | A Siri pergunta a tarefa e registra |
| Salvar na memória do Jarvis | (pelo app Atalhos / Folha de Compartilhamento) | Não | Guarda um texto ou link na memória |

> A Siri exige o nome do app na frase. O app se chama "JARVIS AI" e registra **"Jarvis"** como nome alternativo
> (`INAlternativeAppNames`). As frases foram escritas em português (idioma de desenvolvimento pt-BR).

### Botão de Ação (iPhone 16 Pro Max)

Ajustes → **Botão de Ação** → **Atalho** → **JARVIS AI** → **Conversar**. Um toque longo no botão abre o Jarvis ouvindo.

### Respostas da Siri sem abrir o app

As intents em segundo plano precisam de uma chave deste iPhone:

1. Publique o backend com **HTTPS** (a chave é de longa duração e não deve trafegar sem criptografia).
2. No app: Ajustes → **Siri, Atalhos e Botão de Ação** → **Ativar respostas da Siri**.

A chave:
- é gerada pelo servidor e mostrada uma única vez ao app, que a guarda no **Keychain** (disponível em segundo plano após o primeiro desbloqueio, somente neste aparelho);
- fica armazenada no servidor apenas como **hash SHA-256**;
- só funciona em `/v1/intents/*` (resumo, agenda, registrar tarefa, salvar memória). Não lê conversas, não apaga nada, não envia e-mails nem confirma ações;
- pode ser **revogada** no app a qualquer momento (efeito imediato); cada uso aparece no registro de ações.

### Compartilhar conteúdo com o Jarvis

No app Atalhos: crie um atalho com a ação **"Salvar na memória do Jarvis"**, ative **"Mostrar na Folha de
Compartilhamento"** e escolha receber Texto/URLs. Depois, em qualquer app: Compartilhar → seu atalho.

## Calendário, Lembretes, Contatos e localização

Ative em Ajustes → **iPhone** (o iOS pede a permissão na hora):

- **Calendário e Lembretes:** a cada pergunta, o app envia ao Jarvis os eventos dos próximos 3 dias e os lembretes
  pendentes dos próximos 7 dias (no máximo 40 de cada), marcados como dado não confiável.
- **Localização aproximada:** cidade/região e coordenadas arredondadas (~1 km), só com o app aberto.
- **Contatos:** nunca saem do iPhone. Quando você pede "ligue para o Rafael", o nome vai para o servidor; a busca
  do número acontece no aparelho, no momento em que você confirma. Se houver mais de um número, o app pergunta qual.

## Ações executadas no iPhone

O Jarvis pode propor, e você confirma no cartão:

| Pedido | Ação no iPhone |
|---|---|
| "Crie um lembrete no iPhone para…" | Lembrete no app Lembretes (iCloud), com alarme no horário |
| "Marque no calendário do iPhone…" | Evento no calendário padrão do aparelho |
| "Ligue para…" | Abre a ligação (o iOS ainda pede para confirmar a chamada) |
| "Mande no WhatsApp para… que…" | Abre a conversa pelo link oficial `wa.me` com o texto pronto; **você toca em Enviar** |
| "Mande um SMS / e-mail…" | Abre Mensagens / Mail com o texto pronto |
| "Abra no Mapas…" / "Abra o link…" | Abre o Apple Mapas / uma página `https://` |

A ação só fica como **executada** quando o iPhone informa sucesso ao servidor. Se faltar permissão ou o contato não
for encontrado, ela fica como **falhou**, com o motivo. Nada é enviado sozinho: nenhuma automação não oficial de WhatsApp.

## Limites do iOS (o que não é possível)

- Escuta permanente da palavra "Jarvis" com o app fechado: não é permitido a apps de terceiros. Use a Siri ou o Botão de Ação.
- Controlar outros apps ou ler dados deles: não. Só links oficiais (telefone, Mensagens, WhatsApp, Mail, Mapas).
- A Siri só reconhece as frases das App Shortcuts **com o nome do app**; frases livres usam "Conversar com Jarvis".

## Arquivos

| Arquivo | Papel |
|---|---|
| `apps/mobile/native/ios/JarvisAppIntents.swift` | App Intents + AppShortcutsProvider (copiado para o alvo do app) |
| `apps/mobile/plugins/withJarvisAppIntents.js` | Config plugin: injeta o Swift no alvo principal, nome alternativo "Jarvis", região pt-BR |
| `apps/mobile/modules/jarvis-native/` | Módulo Expo: Keychain e ponte de intents → JavaScript |
| `apps/mobile/src/lib/device.ts` | Calendário/Lembretes/Contatos/Localização e execução das ações confirmadas |
| `apps/server/src/routes/phase3.ts` | Chaves de aparelho, `/v1/intents/*`, relato de ações no iPhone |
