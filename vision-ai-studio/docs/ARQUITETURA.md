# VISION AI STUDIO — Arquitetura e plano técnico

Documento de referência da Fase 1 (MVP funcional). Tudo o que está marcado como
**implementado** foi verificado com testes automatizados e/ou o roteiro de aceite
(`npm run acceptance`) contra a aplicação real em execução.

---

## 0. Viabilidade

O produto é viável com tecnologia madura, desde que se separe claramente:

| Camada | Natureza | Tecnologia |
|---|---|---|
| Corte, junção, reenquadramento, legendas, mixagem, exportação | **Determinística** (100% confiável, testável) | FFmpeg/FFprobe |
| Detecção de silêncio, cenas e movimento | **Sinal técnico** (confiável, mas não "entende" a cena) | Filtros do FFmpeg + cálculo próprio |
| Transcrição | **Serviço de IA** (alta qualidade em pt-BR) | API de áudio (OpenAI) ou whisper.cpp local |
| Interpretar pedidos e decidir a edição | **IA generativa** com saída estruturada | Claude (API Anthropic) → JSON validado |
| Entender o que acontece na imagem ("o acabamento") | **IA multimodal** por amostragem de quadros | Claude com imagens dos quadros |

A decisão central: **a IA nunca controla o FFmpeg diretamente**. Ela produz um
plano de edição JSON validado (Zod) que um motor determinístico aplica sobre a
timeline. O renderizador transforma a timeline em argumentos do FFmpeg (array,
sem shell). Isso torna o sistema auditável, testável, barato de depurar e
seguro contra injeção de comandos.

Riscos e limites assumidos honestamente:
- Reconhecimento de ações exige IA multimodal e, mesmo assim, é por amostragem
  (quadros), não análise contínua. Sem chave de IA, o sistema responde que não
  consegue identificar o momento e pede o intervalo.
- "Potencial de viralização" não é previsível de forma confiável; a pontuação de
  trechos é apresentada como **heurística** (movimento, fala, ausência de silêncio).
- Músicas: não há biblioteca licenciada integrada; só faixas enviadas pelo usuário
  com declaração de licença obrigatória.

---

## 1. Estrutura geral do sistema

```
 Navegador (Next.js/React, pt-BR)
   │  upload direto (URL assinada / multipart S3)          ┌────────────────────┐
   ├──────────────────────────────────────────────────────▶│ Armazenamento S3   │
   │  API REST (cookies httpOnly, SameSite=Lax)            │ (ou disco local)   │
   ▼                                                       └─────────▲──────────┘
 Aplicação web (Next.js route handlers, Node)                        │
   │  grava projetos, versões, comandos, renderizações               │
   │  enfileira tarefas  ───────────────┐                            │
   ▼                                    ▼                            │
 PostgreSQL  ◀──── fila (jobs, SKIP LOCKED) ────▶ Worker(s) de mídia ┘
                                                  ├ FFprobe/FFmpeg (análise, render)
                                                  ├ Transcrição (OpenAI / whisper.cpp)
                                                  └ Planejador de edição (Claude)
```

- **Web** não executa processamento pesado (nada de render em função serverless).
- **Worker** roda em contêiner próprio, com concorrência configurável, batimento
  (heartbeat), cancelamento, retentativas e recuperação de tarefas órfãs.
- **Fila no PostgreSQL** (`SELECT … FOR UPDATE SKIP LOCKED`): transacional com os
  dados, sem infraestrutura extra no MVP; interface pequena para trocar por
  SQS/Redis quando a escala exigir.

## 2. Arquitetura técnica

| Componente | Escolha | Motivo |
|---|---|---|
| Front-end | Next.js 15 (App Router), React 19, TypeScript, Tailwind | SSR para dashboard, rotas de API no mesmo projeto, ótimo em celular |
| Back-end | Route handlers Node (web) + worker Node/TypeScript | Mesma linguagem e mesmos tipos (`@vision/core`) no front, API e worker |
| Banco | PostgreSQL 16 + Drizzle ORM (sem binários nativos) | Relacional, JSONB para timeline/análise, migrações SQL versionadas |
| Fila | Tabela `jobs` no PostgreSQL | Simples, durável, transacional |
| Mídia | FFmpeg 6+/FFprobe via `spawn` (args em array) | Padrão da indústria; sem shell = sem injeção |
| Armazenamento | Driver S3 (AWS/R2/MinIO) ou local | URLs pré-assinadas, multipart, bucket privado |
| IA de edição | Claude (`claude-opus-5-5`) com saída estruturada (JSON Schema) | Plano validado, com fallback de recusa no servidor |
| Transcrição | Provedores plugáveis: OpenAI (`whisper-1`) e whisper.cpp | Modular, troca por variável de ambiente |
| Autenticação | E-mail/senha com scrypt, sessão em cookie httpOnly (token só como hash no banco) | Sem dependências externas; organizações/usuários desde o início |

Pacotes do monorepo (npm workspaces):

- `@vision/core` — **puro** (sem I/O): presets de plataforma, modelo de timeline,
  plano de edição, motor determinístico, seleção de melhores momentos, legendas
  (blocos, SRT, ASS), construtor de comandos FFmpeg, interpretador local de comandos.
- `@vision/db` — schema Drizzle, migrações, cliente, fila.
- `@vision/server` — configuração, logs estruturados, armazenamento, custos/limites,
  serviços de projeto; `@vision/server/node`: FFmpeg, análise, transcrição, planejador de IA.
- `apps/web` — interface e API. `apps/worker` — processamento.

## 3. Estrutura de diretórios

```
vision-ai-studio/
├── apps/
│   ├── web/                      # Next.js (interface + API)
│   │   └── src/
│   │       ├── app/(auth)/       # entrar, cadastro
│   │       ├── app/(app)/        # dashboard, novo, projetos/[id] (estúdio), marcas, biblioteca, exportações, cortes
│   │       ├── app/api/          # auth, projects, uploads, storage, renders, jobs, brands, assets, usage
│   │       ├── components/       # UI, AppShell, NewProjectWizard, BrandEditor
│   │       │   └── studio/       # PreviewPlayer, TimelineView, Assistant/Captions/Format/Audio/Export/Versions/Files
│   │       └── lib/              # sessão, API, DTOs, upload direto (multipart)
│   └── worker/
│       └── src/                  # loop da fila, contexto (heartbeat/cancelamento), pipeline automático
│           └── handlers/         # probe, analyze, transcribe, ai-command, render
├── packages/
│   ├── core/  (src + test)       # lógica de edição pura e testável
│   ├── db/    (src, migrations, test)
│   └── server/(src + test)       # serviços e testes com FFmpeg real
├── scripts/                      # make-fixtures, acceptance, dev-local/stop-local
├── docs/ARQUITETURA.md
├── Dockerfile.web · Dockerfile.worker · docker-compose.yml
└── .env.example
```

## 4. Banco de dados

Entidades (ver `packages/db/src/schema.ts` e `packages/db/migrations/`):

| Tabela | Conteúdo |
|---|---|
| `organizations` | Organização (equipe), limites mensais configuráveis (IA US$, armazenamento, minutos de render) |
| `users`, `memberships` | Usuários e papéis por organização (owner/admin/editor/viewer) |
| `sessions` | Sessões (id = SHA-256 do token do cookie), expiração |
| `brands` | Minhas Marcas: segmento, tom, cores, fontes, estilo padrão, logo oficial, músicas licenciadas |
| `projects` | Projeto, marca, destinos, status real, versão atual, pasta, configuração do modo automático |
| `assets` | Arquivos: vídeos de origem, músicas, logos, renders, SRT, prévias; metadados do ffprobe e análise |
| `transcripts` | Transcrição por arquivo: texto, palavras e segmentos com tempos, provedor, custo |
| `segments` | Intervalos analisados: silêncio, cena, estático, frase |
| `timeline_versions` | **Versões imutáveis** da timeline (JSON), com pai (desfazer/refazer/ramificação) |
| `ai_commands` | Pedido do usuário, plano JSON, resposta, operações aplicadas, avisos, pedidos não executados, tokens e custo |
| `templates` | Modelos (estrutura pronta; editor de templates na Fase 2) |
| `jobs` | Fila: tipo, status, progresso, etapa, tentativas, batimento, cancelamento, erro, tempo de processamento |
| `exports`, `renders` | Exportação (lote) e cada renderização: formato, configurações, progresso, arquivo final e SRT |
| `usage_events` | Consumo: tokens de IA, segundos transcritos/renderizados/analisados, custo estimado |

Princípios: todas as consultas da API filtram por `org_id`; a timeline é a fonte
única da verdade e nunca é alterada no lugar (cada edição cria uma versão).

## 5. Interface inicial

- **Dashboard**: três ações principais (Criar vídeo com IA · Cortes de vídeo longo
  [Fase 3, identificado] · Editor completo), indicadores reais de armazenamento,
  renderização e custo de IA do mês, projetos em processamento/recentes/finalizados,
  histórico de exportações, marcas e biblioteca, e selos de capacidade (IA e
  transcrição configuradas ou não).
- **Novo projeto com IA**: envio de vários vídeos, marca, destinos (YouTube,
  Instagram, Facebook), estilo, comando em português, renderização automática.
- **Estúdio**: modo *Edição automática* (prévia + assistente + exportação) e
  *Editor avançado* (timeline multifaixa com vídeo, áudio original, música,
  legendas e logo; dividir, excluir, mover, ajustar início/fim, zoom, enquadramento
  manual, volume por trecho). Painéis: Assistente, Legendas, Formato, Áudio e logo,
  Exportar, Versões (desfazer/refazer/restaurar/comparar) e Arquivos (tarefas com
  progresso, cancelar e tentar novamente).
- **Minhas Marcas**, **Biblioteca**, **Exportações** e página honesta de **Cortes longos**.
- Tema escuro grafite com dourado, responsivo (navegação inferior no celular).

## 6. Fluxo real de processamento

1. `POST /api/uploads` valida tipo/tamanho/limite de armazenamento e devolve URL
   assinada (ou partes multipart no S3). O navegador envia direto ao armazenamento.
2. `POST /api/uploads/:id/complete` confirma o tamanho e enfileira **probe**.
3. **probe** (worker): ffprobe, validação (vídeo, duração, dimensões, rotação de
   celular), miniatura; cria a **versão 1** da timeline quando todos os vídeos
   foram lidos; enfileira **analyze**.
4. **analyze**: `silencedetect` + `volumedetect`; `select=gt(scene)` + `showinfo`
   para trocas de cena; quadros 64×36 em cinza a 2 fps para energia e centro de
   movimento (reenquadramento). Salva em `assets.analysis` e `segments`.
5. **transcribe** (se configurado): áudio mono 16 kHz em blocos de 10 min →
   provedor → palavras e frases com tempos → `transcripts`.
6. **ai_command**: contexto compacto (trechos, fala, silêncios, marca, músicas) +
   até N quadros amostrados → Claude com JSON Schema → `parseEditPlan` (Zod) →
   motor determinístico → nova versão. Sem chave: interpretador local. Legendas
   pedidas sem transcrição disparam a transcrição antes de aplicar.
7. **render**: timeline → arquivo `.ass` (legendas estilizadas) + grafo de filtros
   (`-filter_complex_script`) → FFmpeg com `-progress pipe:1` (progresso real) →
   verificação com ffprobe (duração) → upload → `renders` + SRT.
8. Após cada tarefa, o status do projeto é **recalculado a partir das tarefas reais**
   e o modo automático avança (análise → transcrição → comando → render).

Falhas: erros traduzidos para o usuário, retentativa com espera exponencial só
para erros recuperáveis, falha definitiva preserva projeto e versões, botão
"Tentar novamente". Worker que cai tem suas tarefas devolvidas à fila.

## 7. Estratégia de IA

- **Formato**: `EditPlan = { reply, operations[] }`, com 17 operações tipadas
  (`trim_start`, `keep_range`, `remove_range`, `target_duration`, `zoom_range`,
  `remove_silences`, `remove_static`, `set_format`, `set_reframe`, `set_captions`,
  `add_logo`, `set_music`, `set_audio`, `set_style`, `unsupported`, …). Tempos sempre
  no vídeo final atual. Campos obrigatórios/nulos para compatibilidade com saída
  estruturada; limites numéricos aplicados pelo motor.
- **Modelo**: `claude-opus-5-5` (configurável), esforço `medium`, prompt de sistema
  em cache, fallback de recusa no servidor (`fallbacks: "default"`), tratamento de
  `refusal`/`max_tokens`/erros de API com queda para o interpretador local
  (informada na resposta ao usuário).
- **Honestidade**: o prompt proíbe afirmar ter visto algo fora dos quadros,
  transcrição ou análise; pedidos impossíveis viram `unsupported` com motivo, que
  aparece no chat.
- **Visão**: amostragem de quadros do vídeo final atual (padrão 10, 512 px) para
  pedidos como "aproxime quando o barbeiro fizer o acabamento" → `zoom_range`.
- **Seleção de melhores momentos** (determinística): unidades = frases completas
  (com transcrição) + trechos sem fala divididos por cenas/silêncios; pontuação =
  movimento × peso do estilo + fala × peso − silêncio; escolha gulosa até a duração
  alvo, mantendo ordem cronológica e cortando em fim de palavra/frase.
- **Templates**: a parte executável do template vira operações do motor; a
  orientação narrativa (ex.: "antes no início, depois no final") só é usada pela IA
  e entra no contexto dos comandos seguintes.
- **Textos para redes**: gerados apenas a partir da fala que ficou no vídeo final,
  de quadros amostrados e do tom da marca; sem chave de IA o recurso fica
  desativado (HTTP 501), nada é inventado.
- **Interpretador local**: cobre pedidos comuns em pt-BR (durações por extenso,
  cortes de início/fim/intervalo, silêncios, formatos, legendas, logo, música,
  ruído) para o sistema ser útil sem chave de IA — sempre identificado na interface.

## 8. Custos e serviços externos

| Serviço | Necessário? | Custo de referência (verifique preços atuais) |
|---|---|---|
| Servidor web (contêiner) | Sim | US$ 5–20/mês (1 vCPU) |
| Worker de mídia (contêiner) | Sim | US$ 20–80/mês (2–4 vCPU); render 1080p ~0,5–2× tempo real por vídeo em 4 vCPU (`veryfast`) |
| PostgreSQL gerenciado | Sim | US$ 15–50/mês |
| Armazenamento S3/R2 | Sim (ou disco local) | ~US$ 0,015–0,023 por GB/mês; R2 sem custo de saída |
| Claude (Anthropic) | Opcional (recomendado) | US$ 4/MTok entrada, US$ 20/MTok saída (Opus 5.5). Um comando típico (~5–10 mil tokens com quadros, ~1 mil de saída) ≈ US$ 0,04–0,06 |
| Transcrição OpenAI (`whisper-1`) | Opcional (legendas) | ~US$ 0,006/min → workshop de 2 h ≈ US$ 0,72 |
| whisper.cpp local | Alternativa | Sem custo por uso; exige CPU/GPU e modelo baixado |

Controle de custos implementado: orçamento mensal de IA por organização
(bloqueia comandos/transcrições ao atingir), limite de armazenamento (bloqueia
uploads), limite de minutos de render, registro de custo estimado por comando e
por projeto (`usage_events`), indicadores no dashboard.

## 9. Etapas de implementação

**Fase 1 — MVP funcional (este entregável)**: aplicação web, autenticação,
organizações, dashboard, upload direto (multipart), armazenamento local/S3,
projetos, player com prévia da edição, análise técnica, corte real, transcrição
(plugável), legendas (6 estilos, edição de texto/tempo, SRT, queima no vídeo),
conversão de proporção com reenquadramento por movimento, exportação MP4/H.264
(720p/1080p/4K condicionado, qualidade, bitrate, FPS, lote), comandos com IA,
progresso real, versões com desfazer/refazer/comparar, perfis de marca com logo
oficial, música licenciada com ducking, cancelamento e retentativas.
*Além do escopo mínimo, já entregues de forma básica*: remoção de silêncios e de
trechos parados, seleção heurística de melhores momentos, exportação em lote,
zoom por trecho.

**Fase 2 — Edição inteligente (entregue)**: templates inteligentes (11 do sistema +
templates próprios salvos a partir de um projeto; operações determinísticas +
orientação narrativa para a IA, aplicados também no modo automático), edição pela
transcrição (`remove_source_range` / `restore_source_range`), sugestões de cortes
a partir de gravações longas com aprovação/descarte (cada corte vira um projeto que
reaproveita o vídeo), detecção de batida (onset + autocorrelação, com limiar de
força do pulso para não "inventar" ritmo) e `sync_to_beat`, gerador de textos para
redes sociais com saída estruturada (tabela `content_suggestions`, tarefa
`generate_content`). *Pendente*: biblioteca de músicas licenciadas integrada e
vinhetas de abertura/encerramento por marca.

**Fase 3 — Estúdio avançado**: segmentação de gravações longas por temas com IA e
exportação em lote de vários cortes, rastreamento de pessoas/rostos para reenquadramento, narração por voz
artificial (provedor plugável), transições/efeitos, textos e imagens na timeline,
thumbnails inteligentes.

**Fase 4 — Plataforma comercial**: convites e papéis em equipe, planos e créditos,
cobrança, métricas, OAuth com YouTube/Instagram/Facebook e publicação/agendamento
via APIs oficiais (a arquitetura já separa exportação de publicação; nada de
publicação simulada).
