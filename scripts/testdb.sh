#!/usr/bin/env bash
# Builds the database the DB tests run against.
# If TEST_DATABASE_URL is set it is used as-is (it must be empty: migrations are applied on top).
# Otherwise a throwaway PostgreSQL cluster is created under .testdb/ on port 54329.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=54329
if [ -z "${TEST_DATABASE_URL:-}" ]; then
  BIN="$(ls -d node_modules/@embedded-postgres/*/native/bin 2>/dev/null | head -1 || true)"
  if [ -z "$BIN" ]; then
    command -v initdb >/dev/null 2>&1 || { echo "No PostgreSQL binaries found (install devDependency embedded-postgres, or set TEST_DATABASE_URL)"; exit 1; }
    BIN=""
  else
    BIN="$BIN/"
  fi
  DATA=".testdb/data"
  if [ ! -f "$DATA/PG_VERSION" ]; then
    mkdir -p .testdb
    "${BIN}initdb" -D "$DATA" -U postgres -A trust -E UTF8 >/dev/null
  fi
  if ! "${BIN}pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
    "${BIN}pg_ctl" -D "$DATA" -o "-p $PORT -c timezone=UTC -c fsync=off" -l .testdb/server.log -w start >/dev/null 2>&1 </dev/null
  fi
  export TEST_DATABASE_URL="postgres://postgres@localhost:$PORT/spa_test"
  export TESTDB_RECREATE=1
fi
node scripts/build-testdb.mjs
