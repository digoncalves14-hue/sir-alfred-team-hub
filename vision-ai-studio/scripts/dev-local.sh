#!/usr/bin/env bash
# Sobe web (produção) + worker localmente em segundo plano, com logs em ./data/logs.
# Pré-requisitos: .env configurado, banco migrado (npm run db:migrate) e build feito (npm run build).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/logs
setsid bash -c 'cd apps/web && exec npx next start -p "${PORT:-3000}"' > data/logs/web.log 2>&1 < /dev/null &
echo $! > data/logs/web.pid
setsid bash -c 'cd apps/worker && exec node --env-file-if-exists=../../.env ../../node_modules/.bin/tsx src/index.ts' > data/logs/worker.log 2>&1 < /dev/null &
echo $! > data/logs/worker.pid
echo "Web: http://localhost:${PORT:-3000}  (logs em data/logs)"
