# Estimativa de custos

Estimativas feitas em novembro de 2026 a partir das tabelas públicas de preço que conheço. Elas **mudam**:
confirme nos sites oficiais antes de decidir. O painel do app mostra o custo **estimado** real pelo número de
tokens de cada requisição; a fatura oficial é a do provedor.

## Por conversa (IA)

Com as Fases 1–4, cada chamada envia ~6.100 tokens fixos (instruções + 25 ferramentas), mais histórico e contexto
(~2.000) e recebe ~300 de saída. A parte fixa entra no **cache de prompt**: na primeira fala de uma sequência ela
é gravada no cache (um pouco mais cara) e, nas falas seguintes dentro de ~5 minutos, é lida do cache (≈ 5% do preço).
Quando o Jarvis usa uma ferramenta, são 2 chamadas.

| Modelo (`AI_MODEL`) | Preço (entrada / saída por 1M tokens) | Fala simples | Fala com ferramenta |
|---|---|---|---|
| `claude-opus-5-5` (padrão) | US$ 4 / US$ 20 | ~US$ 0,015 (com cache) a 0,045 | ~US$ 0,03 a 0,065 |
| `claude-sonnet-5-5` | US$ 2 / US$ 10 | ~US$ 0,008 a 0,022 | ~US$ 0,016 a 0,035 |
| `claude-haiku-5-5` | US$ 0,10 / US$ 0,50 | ~US$ 0,0004 a 0,0012 | ~US$ 0,001 a 0,002 |

**Exemplo de mês** com 30 falas por dia (metade com ferramenta, em conversas de várias falas): Opus 5.5 ≈ US$ 25–40;
Sonnet 5.5 ≈ US$ 12–20; Haiku 5.5 ≈ US$ 1. O painel do app mostra o valor real estimado, já considerando o cache. O limite diário padrão é US$ 1,00 (ajustável em Ajustes) e bloqueia novas chamadas quando atingido.

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
| Notificações push | APNs/Expo Push: US$ 0 | |
| Apple Developer Program | US$ 99/ano | Necessário para instalar no iPhone/TestFlight |
| EAS Build | Gratuito com limite mensal de builds | |
| Google Calendar/Gmail API | US$ 0 nas cotas normais de uso pessoal | |
| Cron externo (se o backend dormir) | cron-job.org e similares: US$ 0 | Alternativa a manter o servidor sempre ligado |

**Fase 4:** indicadores, relatórios e automações são calculados sem IA (custo zero); as APIs do Hub e do Google
Planilhas são gratuitas no uso pessoal. Só a conversa sobre os números usa IA.

**Fase 2 e custo de IA:** o resumo diário e os lembretes são montados sem IA (custo zero). Perguntas como
"o que temos hoje?" usam 1 a 2 chamadas extras de ferramenta (~US$ 0,02 a mais por pergunta no Opus 5.5).
Ler um e-mail longo pode adicionar até ~2.000 tokens de entrada (~US$ 0,008 no Opus 5.5).

**Agendador sempre ligado:** para lembretes pontuais, o backend precisa rodar 24 h (Render Starter ≈ US$ 7/mês,
Fly.io ≈ US$ 2–5/mês) ou ser acordado por um cron externo gratuito a cada minuto.

**Total estimado para uso pessoal:** ~US$ 8/mês (US$ 99/ano da Apple) + IA conforme o modelo
(≈ US$ 1 a US$ 30/mês) + backend (US$ 0 a 7/mês).
