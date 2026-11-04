# Versão web (grátis) — usar o Jarvis no navegador do iPhone

Esta versão roda no Safari e pode ser adicionada à Tela de Início como um app, **sem** a conta Apple Developer.
O próprio backend entrega o app: um único endereço HTTPS para o app e a API.

## O que funciona e o que não funciona

| Recurso | Web | App instalado |
|---|---|---|
| Conversa por voz e texto, respostas em tempo real, fala frase a frase | ✅ (voz do Safari) | ✅ |
| Memória, histórico, rotinas, confirmação de ações, controle de custos | ✅ | ✅ |
| Google Agenda e Gmail | ✅ (cliente OAuth "Web") | ✅ |
| Negócios: Google Planilhas, relatórios, automações | ✅ | ✅ |
| Ligação, SMS, WhatsApp, e-mail, Mapas (por link, você envia) | ✅ (informando o número) | ✅ (busca nos Contatos) |
| Localização aproximada | ✅ (permissão do Safari) | ✅ |
| Calendário/Lembretes/Contatos do iPhone | ❌ | ✅ |
| Siri, Atalhos, Botão de Ação | ❌ | ✅ |
| Notificações push | ❌ (avisos aparecem no Painel) | ✅ |
| Face ID | ❌ | ✅ |
| Sir Alfred Team Hub (OAuth) | ❌ (use Planilha) | ✅ |
| Interromper falando | ❌ | ✅ (experimental) |

Quando você usa a versão web, o servidor **não oferece** ao Jarvis as ferramentas que dependem do iPhone e o avisa
disso; se ainda assim ele tentar, a chamada é recusada.

## Custos

- Supabase (plano gratuito), Render (plano gratuito): R$ 0. O Render gratuito "dorme" após ~15 min sem uso; a primeira
  abertura depois disso demora ~1 minuto.
- IA (Anthropic): paga por uso. O blueprint já começa com `claude-haiku-5-5` (o mais barato, alguns reais por mês em
  uso pessoal). Defina o limite mensal em Ajustes. Para mais qualidade, troque `AI_MODEL` no Render.

## Passo a passo

### 1. Banco (Supabase)
Projeto separado `jarvis-ai` com as 5 migrações (RLS em todas as tabelas). Depois, no painel do Supabase:
- **Authentication › URL Configuration › Site URL**: o endereço do Render (passo 2), ex.: `https://jarvis-ai-xxxx.onrender.com`.
- **Project Settings › API Keys**: você vai copiar a URL, a chave *publishable* (ou *anon*) e a *secret/service_role*
  direto para o Render. Não envie nenhuma delas por chat.

### 2. Servidor + app (Render)
1. Crie uma conta em render.com (pode entrar com o GitHub).
2. **New › Blueprint**, escolha o repositório `sir-alfred-team-hub`. O Render lê o arquivo `render.yaml` da raiz.
3. Preencha os valores pedidos na tela:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: do passo 1.
   - `ANTHROPIC_API_KEY`: crie em console.anthropic.com › API Keys (adicione um pequeno crédito e, se quiser, um limite
     de gasto mensal lá também).
   - `ALLOWED_EMAILS`: **o e-mail que você vai usar para entrar no Jarvis**. Outras contas são recusadas, mesmo que
     alguém descubra o endereço.
   - `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_WEB_CLIENT_SECRET`, `VOYAGE_API_KEY`: opcionais, podem ficar vazios.
   - `TOKEN_ENCRYPTION_KEY` e `CRON_SECRET` são gerados pelo Render automaticamente.
4. **Apply**. O primeiro build leva alguns minutos. Quando terminar, abra `https://<seu-endereço>/health`:
   deve mostrar `"ok":true` e `"configured":true` na IA.

### 3. No iPhone
1. Abra o endereço do Render no **Safari**.
2. **Criar conta** com o e-mail de `ALLOWED_EMAILS` e confirme pelo link que chega por e-mail; depois **Entrar**.
3. Compartilhar (□↑) › **Adicionar à Tela de Início** › "Jarvis".
4. Abra pelo ícone, toque no orbe e permita o microfone. Se o Safari não ouvir: Ajustes do iPhone › Geral › Teclado ›
   **Ditado** ligado, e em Safari › "aA" › Ajustes do Site › Microfone › Permitir.
5. Em Ajustes do Jarvis: defina o limite mensal e, se quiser, o modo econômico.

### 4. Google Agenda e Gmail (opcional)
No Google Cloud Console (mesmo projeto de `docs/GOOGLE.md`), crie **Credenciais › ID do cliente OAuth › Aplicativo da
Web** com o URI de redirecionamento autorizado:

```
https://<seu-endereço-no-render>/google-oauth
```

Coloque o ID e a chave secreta em `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_WEB_CLIENT_SECRET` no Render (a chave secreta fica
só no servidor). Depois: Ajustes do Jarvis › Integrações › Conectar.

## Como funciona (técnico)

- `Dockerfile.server` tem 2 etapas: `expo export --platform web` e o servidor Node, que serve a pasta exportada
  (`WEB_DIR`) e injeta no `index.html` apenas a configuração pública do Supabase (`window.__JARVIS__`).
- Arquivos específicos da web: `src/lib/*.web.ts` (sessão no `localStorage`, push desativado, ações por link,
  exportação por download, alertas do navegador, desbloqueio da voz no 1º toque) e `src/app/google-oauth.tsx`.
- Google na web: o login acontece na mesma janela e volta para `/google-oauth`; o app conclui pelo backend, que
  confere que o pedido é do mesmo usuário (state cifrado). O segredo do cliente fica só no servidor.
- `ALLOWED_EMAILS` é verificado a cada sessão nova no backend (403 para outras contas).
- `TRUST_PROXY=true` (Render) faz o limite de requisições por minuto usar o IP real. Arquivos do app não contam no limite.

## Limitações da versão web
- O reconhecimento de voz do Safari é menos preciso que o do app nativo e pode exigir tocar no orbe a cada fala.
- A sessão fica no armazenamento do navegador. Use apenas no seu próprio iPhone.
- No plano gratuito, lembretes e o resumo diário só são gerados quando o servidor está acordado (um cron gratuito
  chamando `POST /internal/cron/tick` com o cabeçalho `x-cron-secret` resolve; veja `docs/IOS.md`).
