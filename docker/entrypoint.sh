#!/bin/sh
# Container start: migrate, optionally seed an empty database, then serve.
# With arguments (e.g. `docker compose run --rm app node scripts/seed.cjs`) it runs them instead.
set -e

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

node scripts/migrate.cjs

if [ "${AUTO_SEED:-false}" = "true" ]; then
  node scripts/seed.cjs --if-empty
fi

exec node server.js
