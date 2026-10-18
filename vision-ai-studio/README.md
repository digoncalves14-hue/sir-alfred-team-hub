# VISION AI STUDIO

Plataforma web de edição e criação de vídeos com inteligência artificial para redes
sociais, em português do Brasil. Envie vídeos, escolha a marca e o destino, descreva
o resultado e a plataforma corta, reenquadra, legenda e exporta MP4 de verdade
(FFmpeg), com histórico de versões.

> Arquitetura completa, banco de dados, estratégia de IA, custos e plano de fases:
> [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## O que funciona na Fase 1

| Recurso | Situação |
|---|---|
| Cadastro/login, organizações, sessões seguras | ✅ |
| Dashboard com status reais, indicadores de armazenamento/render/custo de IA | ✅ |
| Upload direto (URL assinada; multipart no S3), validação e limites | ✅ |
| Análise técnica: metadados, silêncios, trocas de cena, mapa de movimento | ✅ |
| Estúdio: prévia em tempo real, timeline multifaixa, modo automático e avançado | ✅ |
| Cortes reais (trecho, início/fim, remover intervalo, dividir, reordenar) | ✅ |
| Versão de N segundos com melhores momentos (heurística transparente) | ✅ |
| Remoção de silêncios e de trechos parados | ✅ |
| Formatos 16:9, 9:16, 4:5, 1:1 com reenquadramento pelo movimento + ajuste manual, zoom | ✅ |
| Legendas: 6 estilos, palavra destacada, edição de texto/tempo, área segura, SRT, queima no vídeo | ✅ (requer provedor de transcrição) |
| Transcrição pt-BR (OpenAI ou whisper.cpp) | ✅ implementada — **depende de credencial/binário** |
| Comandos em linguagem natural → plano JSON validado → motor determinístico | ✅ com Claude **(requer `ANTHROPIC_API_KEY`)**; sem chave, interpretador local para pedidos comuns |
| Análise visual por amostragem de quadros (ex.: zoom no "acabamento") | ✅ implementada — **requer `ANTHROPIC_API_KEY`** |
| Minhas Marcas (5 marcas iniciais), logo oficial (nunca gerada por IA), cores, fontes, músicas | ✅ |
| Música própria com licença declarada, volume, fades, ducking na fala; normalização; redução de ruído | ✅ |
| Exportação MP4/H.264, 720p/1080p/4K (se a origem permitir), qualidade, bitrate, FPS, lote | ✅ |
| Progresso real, cancelamento, retentativas, recuperação de worker, erros compreensíveis | ✅ |
| Histórico de versões, desfazer/refazer, restaurar, comparar | ✅ |
| Cortes de vídeo longo, templates editáveis, narração, publicação em redes | ⏳ Fases 2–4 (identificado na interface) |

## Pré-requisitos

- Node.js 20.12+ (testado com 22)
- PostgreSQL 14+
- FFmpeg 6+ com `libx264`, `libass`, `libmp3lame` (`ffmpeg -filters | grep ass`)
- Opcional: chave da Anthropic (IA de edição) e da OpenAI ou whisper.cpp (transcrição)

## Executar localmente

```bash
cd vision-ai-studio
cp .env.example .env            # ajuste DATABASE_URL e APP_SECRET
npm install
npm run db:migrate              # cria as tabelas
npm run build                   # build de produção da web

# em dois terminais:
npm run start                   # web em http://localhost:3000
npm run start:worker            # worker de processamento
# ou, em segundo plano:  ./scripts/dev-local.sh   (parar: ./scripts/stop-local.sh)
```

Desenvolvimento com recarga: `npm run dev` (web) e `npm run dev:worker`.

Crie uma conta em `/cadastro` — as cinco marcas iniciais (Sir Alfred Barbearia,
Black Bear, Sir Alfred Kids, Barton, Genesis Barber) são criadas automaticamente.
Envie a **logo oficial** de cada marca em *Minhas Marcas* antes de pedir "logo no final".

### Docker (Postgres + MinIO + web + worker)

```bash
cp .env.example .env            # defina APP_SECRET (e chaves de IA, se tiver)
docker compose up --build
```

O MinIO fica em `http://localhost:9000` (console em `:9001`). Em produção, use um
bucket privado com CORS liberando `PUT` da sua origem e expondo o cabeçalho `ETag`
(necessário para upload multipart direto do navegador).

## Configuração de IA e transcrição

| Variável | Efeito |
|---|---|
| `ANTHROPIC_API_KEY` | Ativa o planejador de edição com Claude (`AI_MODEL`, padrão `claude-opus-5-5`) e a análise visual por quadros (`AI_VISION_FRAMES`, padrão 10) |
| `OPENAI_API_KEY` | Ativa a transcrição pela API de áudio (`OPENAI_TRANSCRIBE_MODEL`, padrão `whisper-1`) |
| `WHISPER_CPP_BIN` + `WHISPER_CPP_MODEL` | Transcrição local com whisper.cpp (sem custo por uso) |
| `MONTHLY_AI_BUDGET_USD`, `STORAGE_LIMIT_GB`, `MONTHLY_RENDER_MINUTES` | Limites mensais por organização |

Sem essas chaves, a interface mostra claramente o que está indisponível; nada é simulado.

## Testes

```bash
npm run test:unit         # lógica de edição, legendas, comandos, segurança (sem dependências externas)
npm run test:media        # FFmpeg real: análise, corte, vertical, legendas queimadas, logo+música, erro, cancelamento
npm run test:integration  # fila no PostgreSQL — use um banco de TESTE dedicado e o worker parado
npm run acceptance        # critérios de aceite 1–8 contra a aplicação em execução (web+worker+banco)
```

O roteiro de aceite gera seus próprios vídeos de teste com FFmpeg e grava
`acceptance-report.json`. Sem provedor de transcrição, o TESTE 3 usa uma
transcrição de teste identificada como `provider=fixture` (a queima de legendas e
o SRT continuam reais) e o relatório informa isso.

## Segurança

- Senhas com scrypt; cookie de sessão httpOnly/SameSite=Lax; token salvo apenas como hash.
- Verificação de origem em requisições de escrita; autorização por organização em todas as rotas.
- Chaves de armazenamento geradas pelo servidor; URLs temporárias assinadas; bucket privado.
- FFmpeg executado com argumentos em array (sem shell); textos de legenda escapados; caminhos validados.
- Uploads com lista de formatos, limites de tamanho e verificação real do conteúdo pelo ffprobe.
- Chaves de API apenas no servidor/worker (nunca no navegador); logs estruturados sem segredos.
