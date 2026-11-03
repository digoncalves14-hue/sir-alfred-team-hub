#!/usr/bin/env bash
# Sobe/derruba um PostgreSQL local descartável para os testes de integração (RLS).
# Uso: bash scripts/test-db.sh up|down
# Em CI, prefira um serviço postgres e defina JARVIS_TEST_DATABASE_URL.
set -euo pipefail
PORT="${JARVIS_TEST_DB_PORT:-54329}"
DIR="${JARVIS_TEST_DB_DIR:-/tmp/jarvis-test-pg}"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -x "$BIN/initdb" ] || BIN="$(dirname "$(command -v initdb)")"

run() { if [ "$(id -u)" = "0" ]; then su postgres -c "$*"; else bash -c "$*"; fi; }

case "${1:-up}" in
  up)
    if [ ! -d "$DIR" ]; then
      mkdir -p "$DIR"; [ "$(id -u)" = "0" ] && chown postgres "$DIR"
      run "$BIN/initdb -D $DIR -U postgres --auth=trust -E UTF8 >/dev/null"
    fi
    run "$BIN/pg_ctl -D $DIR -o '-p $PORT -k $DIR -c listen_addresses=localhost' -l $DIR/log.txt -w start" >/dev/null
    echo "PostgreSQL de teste em postgres://postgres@localhost:$PORT/postgres"
    ;;
  down)
    run "$BIN/pg_ctl -D $DIR -m fast stop" >/dev/null || true
    rm -rf "$DIR"
    ;;
esac
