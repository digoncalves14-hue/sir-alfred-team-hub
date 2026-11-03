# Configurar Google Agenda e Gmail (Fase 2)

Tempo estimado: 15 minutos. Custo: gratuito (cotas de uso pessoal das APIs do Google).
Nada disso deve ser enviado pelo chat — os valores vão apenas nos arquivos `.env` e nos painéis.

## 1. Projeto no Google Cloud

1. Acesse **console.cloud.google.com** com a conta Google que você quer conectar (ou outra de sua administração).
2. Crie um projeto, por exemplo **jarvis-ai**.
3. Em **APIs e serviços → Biblioteca**, ative:
   - **Google Calendar API**
   - **Gmail API**

## 2. Tela de consentimento OAuth

Em **APIs e serviços → Tela de consentimento OAuth** (ou "Google Auth Platform"):

1. Tipo de usuário: **Externo**.
2. Nome do app: `JARVIS AI`; e-mail de suporte: o seu.
3. Escopos (adicione exatamente estes — são os mínimos que o Jarvis usa):
   - `openid`, `.../auth/userinfo.email`
   - `https://www.googleapis.com/auth/calendar.events` — ver e editar **eventos** (não mexe nas configurações das agendas)
   - `https://www.googleapis.com/auth/gmail.readonly` — ler e-mails
   - `https://www.googleapis.com/auth/gmail.compose` — criar rascunhos e enviar (o Jarvis **nunca** apaga e-mails)
4. **Usuários de teste:** adicione o seu e-mail.

> **Importante — validade da autorização.** Enquanto o app estiver no status **"Em teste"**, o Google faz a
> autorização expirar em **7 dias** (você teria de reconectar toda semana; o Jarvis avisa quando isso acontece).
> Para uso pessoal contínuo, mude o status para **"Em produção"** sem enviar para verificação: o Google mostrará
> o aviso "O Google não verificou este app" na hora de conectar — clique em *Avançado → Acessar JARVIS AI*.
> Isso é aceitável para um app usado só por você. Para distribuir a outras pessoas, os escopos do Gmail exigem
> verificação do Google (processo longo e com auditoria de segurança).

## 3. Cliente OAuth do tipo iOS

Em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:

1. Tipo de aplicativo: **iOS**.
2. ID do pacote (Bundle ID): o mesmo de `ios.bundleIdentifier` em `apps/mobile/app.json`
   (padrão: `com.digoncalves.jarvisai`).
3. Crie e copie o **ID do cliente** (termina em `.apps.googleusercontent.com`).
   O cliente iOS **não tem client secret** — o fluxo usa PKCE, como recomendado para apps nativos.

## 4. Variáveis

**Backend** (`apps/server/.env`):

```bash
SUPABASE_SERVICE_ROLE_KEY=...        # Supabase → Project Settings → API → service_role (secreta)
TOKEN_ENCRYPTION_KEY=...             # gere com: openssl rand -base64 32  (guarde; trocar invalida os tokens salvos)
GOOGLE_IOS_CLIENT_ID=123-abc.apps.googleusercontent.com
```

**App** (`apps/mobile/.env` e, para builds na nuvem, também em expo.dev → Environment variables):

```bash
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=123-abc.apps.googleusercontent.com
```

Como o ID do cliente entra no esquema de URL do app, **gere um novo build** depois de defini-lo
(`npx eas-cli@latest build --profile development --platform ios`).

## 5. Banco

Aplique a migração `supabase/migrations/20261104000000_jarvis_phase2.sql` no SQL Editor do Supabase
(depois da migração da Fase 1).

## 6. Conectar no app

Ajustes → **Integrações** → marque **Agenda** e/ou **Gmail** → **Conectar conta Google** → faça login e
marque as caixas de permissão. Ao voltar, o status fica **CONECTADO**.

Teste por voz:
- "Jarvis, o que temos para hoje?"
- "Jarvis, marque uma reunião amanhã às 15 horas com a equipe do Sir Alfred." → aparece o cartão **Autorização
  necessária**; o evento só é criado ao tocar em **Confirmar**.
- "Jarvis, organize minha agenda de amanhã." → ele apenas **propõe**; nada é alterado.
- "Jarvis, tenho e-mails importantes?" / "Responda ao fornecedor que entregamos sexta."

## Revogar acesso

- No app: Ajustes → Integrações → **Desconectar e revogar acesso** (revoga no Google e apaga o token).
- Ou em **myaccount.google.com/permissions** → JARVIS AI → Remover acesso.

## Como os dados ficam protegidos

- O app nunca recebe o token do Google. O backend o guarda **cifrado (AES-256-GCM)** numa coluna que o
  próprio usuário logado não consegue ler pelo banco (permissão por coluna).
- O "state" do OAuth é cifrado e expira em 10 minutos, vinculado à sua sessão.
- Conteúdo de e-mails e eventos é tratado como **dado não confiável**: instruções escritas dentro deles são ignoradas.
- Criar, reagendar e cancelar eventos e enviar e-mails exigem confirmação explícita no app.
