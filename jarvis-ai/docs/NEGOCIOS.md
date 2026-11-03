# Negócios: conectores, indicadores, relatórios e automações (Fase 4)

Cada empresa é um **espaço** separado (Sir Alfred, Black Bear, Barton, Alfie & Fred, Educação). Os números
vêm **somente de fontes conectadas e autorizadas**. Sem fonte, o Jarvis diz que não há dados e nunca estima
vendas, estoque, faturamento ou metas.

## Fontes de dados disponíveis

| Fonte | Para quem | Autorização | O que o Jarvis lê |
|---|---|---|---|
| **Sir Alfred Team Hub** (o app da equipe deste repositório) | Sir Alfred | OAuth 2.1 + PKCE no próprio Hub (tela de consentimento), somente leitura, respeitando o RLS do Hub | Desempenho por profissional (faturamento, serviços, comandas), venda de produtos, avaliações de clientes |
| **Google Planilhas** | Todos os espaços | Google OAuth com escopo **somente leitura** (`spreadsheets.readonly`) | A aba/intervalo que você indicar |

Os APIs próprios da loja da Black Bear, do Barton e de outros sistemas ainda não estão conectados. Enquanto isso,
use uma planilha (exportada ou mantida pela equipe). A arquitetura de conectores (`apps/server/src/business/`)
permite acrescentar um conector novo sem mexer no núcleo do assistente.

## Indicadores calculados

**Sir Alfred Team Hub** (último período lançado no Hub, comparado ao anterior):
faturamento, serviços, comandas, ticket médio, destaque da equipe, ranking (top 3), venda de produtos,
média de avaliações dos últimos 30 dias. Alertas: profissional com queda ≥ 20% e avaliações ≤ 3 estrelas.

**Planilhas** (a primeira linha deve ter os títulos das colunas, como Data, Produto, Valor; o Jarvis reconhece variações e acentos):

| Tipo | Colunas reconhecidas | Indicadores | Alertas |
|---|---|---|---|
| Vendas | Data, Produto, Quantidade, Valor/Total | Faturamento dos últimos 30 dias (e variação vs 30 anteriores), nº de vendas, ticket médio, mais vendidos | — |
| Estoque | Produto, Estoque atual/Quantidade, Estoque mínimo | Itens, abaixo do mínimo, zerados | Itens zerados ou abaixo do mínimo |
| Pedidos | Pedido, Data, Status, Total | Pedidos, em aberto, valor em aberto, por status | Abertos há mais de 7 dias |
| Cronograma / aulas | Data, Horário, Aula/Atividade | Próximos 7 dias | — |
| Indicadores e metas | Indicador, Realizado/Valor, Meta | Cada indicador e % da meta | Abaixo de 80% da meta |
| Tabela livre | qualquer | Nº de linhas (o Jarvis pode ler as linhas) | — |

Números em formato brasileiro ("R$ 1.234,56", "85%") e datas "05/11/2026" são entendidos.

## Configuração

### Sir Alfred Team Hub

O Hub já funciona como servidor OAuth (é ele que autentica o MCP "Sir Alfred Equipe" e tem a tela
`/.lovable/oauth/consent`). Falta cadastrar o Jarvis como cliente:

```bash
cd jarvis-ai
node scripts/register-hub-client.mjs https://SEU-PROJETO-DO-HUB.supabase.co
```

O script usa o registro dinâmico de clientes. Se estiver desligado no Hub, cadastre no painel do Supabase do
Hub: **Authentication › OAuth Apps › Add a new client** — nome `JARVIS AI`, redirect URI `jarvis://hub-oauth`,
tipo **Public**. Depois, em `apps/server/.env`:

```bash
HUB_SUPABASE_URL=https://SEU-PROJETO-DO-HUB.supabase.co
HUB_PUBLISHABLE_KEY=chave-publica-do-hub      # a mesma VITE_SUPABASE_PUBLISHABLE_KEY do app da equipe (pública)
HUB_OAUTH_CLIENT_ID=client-id-gerado
```

No app: **Negócios › Sir Alfred › Conectar o Hub** → entre com a conta de gestor no Hub → **Autorizar**.

Revogar: remova a fonte no Jarvis (apaga a credencial) e, se quiser, retire a autorização no Hub.

### Planilhas do Google

1. Em **Ajustes › Integrações**, marque **Planilhas** e reconecte o Google (escopo somente leitura).
2. Em **Negócios › (espaço) › Adicionar planilha do Google**: cole o link, escolha o tipo e, se precisar,
   a aba/intervalo (ex.: `Vendas!A1:H500`).
3. O Jarvis valida o acesso e mostra uma prévia antes de salvar.

## Relatórios e automações

Na aba **Negócios › Automações** você escolhe o que roda, o dia e o horário:

| Automação | Padrão | Comportamento |
|---|---|---|
| Relatório semanal dos negócios | segunda, 08:00 | Indicadores de todas as fontes + tarefas abertas |
| Relatório semanal de pendências | segunda, 07:30 | Tarefas abertas por espaço, atrasadas destacadas |
| Alerta diário de tarefas atrasadas | todo dia, 09:00 | Só notifica se houver tarefa atrasada |
| Alerta diário de estoque baixo | todo dia, 09:00 | Só notifica se houver item zerado/abaixo do mínimo |

- Rodam **no servidor** (com o app fechado) e chegam como notificação; o relatório fica salvo em Negócios.
- Cada automação roda **uma vez por período** (semana ou dia), mesmo com várias instâncias do servidor.
- "Rodar agora" gera o relatório na hora. Por voz: "Jarvis, gere o relatório da Black Bear".
- Relatórios são montados sem IA (custo zero); o Jarvis só usa IA quando você conversa sobre eles.

## Perguntas por voz

- "Jarvis, como foi o faturamento do Sir Alfred?"
- "Quem foi o destaque da equipe no último período?"
- "Tem algum produto da Black Bear com estoque baixo?"
- "Quais aulas da Genesis Barber temos esta semana?"
- "Quanto vendeu a Pomada Matte?" (o Jarvis lê as linhas da planilha)

## Segurança

- Credencial do Hub: refresh token **cifrado** (AES-256-GCM); o Supabase o rotaciona e o Jarvis salva o novo a
  cada renovação. O usuário logado não consegue ler a coluna do segredo.
- Planilhas: escopo somente leitura; o Jarvis nunca altera planilhas.
- Dados de fontes externas entram como **dado não confiável** (instruções escritas em células são ignoradas).
- Cada espaço tem suas próprias fontes e relatórios; nada é misturado sem você pedir uma visão geral.
