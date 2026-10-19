#!/usr/bin/env bash
cd "$(dirname "$0")/.."
for f in data/logs/web.pid data/logs/worker.pid; do
  [ -f "$f" ] && kill -- -"$(cat "$f")" 2>/dev/null || true
  rm -f "$f"
done
echo "Processos locais encerrados."
