#!/bin/sh
# Container start: migrate, optionally seed an empty database, then serve.
set -e

node scripts/migrate.cjs

if [ "${AUTO_SEED:-false}" = "true" ]; then
  node scripts/seed.cjs --if-empty
fi

exec node server.js
