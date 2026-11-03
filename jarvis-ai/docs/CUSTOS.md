# Estimativa de custos

Estimativas feitas em novembro de 2026 a partir das tabelas públicas de preço que conheço. Elas **mudam**:
confirme nos sites oficiais antes de decidir. O painel do app mostra o custo **estimado** real pelo número de
tokens de cada requisição; a fatura oficial é a do provedor.

## Por conversa (IA)

Uma fala típica envia ~4.000 tokens de entrada (instruções + ferramentas + histórico + contexto) e recebe
~300 de saída. Quando o Jarvis usa uma ferramenta (ex.: buscar memória), são 2 chamadas.

| Modelo (`AI_MODEL`) | Preço (entrada / saída por 1M tokens) | Fala simples | Fala com ferramenta |
|---|---|---|---|
| `claude-opus-5-5` (padrão) | US$ 4 / US$ 20 | ~US$ 0,022 | ~US$ 0,042 |
| `claude-sonnet-5-5` | US$ 2 / US$ 10 | ~US$ 0,011 | ~US$ 0,021 |
| `claude-haiku-5-5` | US$ 0,10 / US$ 0,50 | ~US$ 0,0006 | ~US$ 0,0011 |

**Exemplo de mês** com 30 falas por dia (metade com ferramenta): Opus 5.5 ≈ US$ 30; Sonnet 5.5 ≈ US$ 15;
Haiku 5.5 ≈ US$ 1. O limite diário padrão é US$ 1,00 (ajustável em Ajustes) e bloqueia novas chamadas quando atingido.

Para reduzir custo: troque `AI_MODEL` para `claude-sonnet-5-5` ou `claude-haiku-5-5` e compare a qualidade
das respostas no seu uso; diminua `AI_HISTORY_MESSAGES`.

## Voz

| Item | Custo |
|---|---|
| Transcrição (reconhecimento de fala da Apple) | US$ 0 |
| Voz nativa do iPhone (padrão) | US$ 0 |
| Voz premium ElevenLabs (opcional) | Depende do plano; configure `TTS_COST_PER_1K_CHARS_USD` para o painel estimar. Uma resposta típica tem ~150 caracteres |

## Infraestrutura mensal

| Item | Opção econômica | Observação |
|---|---|---|
| Supabase (banco + login) | Plano gratuito | Projetos gratuitos pausam após inatividade prolongada; Pro ≈ US$ 25/mês |
| Backend Node | Render/Railway/Fly.io: gratuito a ~US$ 7/mês | Planos gratuitos “dormem” (primeira resposta lenta) |
| Armazenamento | Incluso no Supabase | Texto de conversas e memórias ocupa pouco (KB por dia) |
| Notificações push (Fase 2) | APNs/Expo Push: US$ 0 | |
| Apple Developer Program | US$ 99/ano | Necessário para instalar no iPhone/TestFlight |
| EAS Build | Gratuito com limite mensal de builds | |
| Google Calendar/Gmail (Fase 2) | US$ 0 nas cotas normais de uso pessoal | |

**Total estimado para uso pessoal:** ~US$ 8/mês (US$ 99/ano da Apple) + IA conforme o modelo
(≈ US$ 1 a US$ 30/mês) + backend (US$ 0 a 7/mês).
