#!/bin/sh
set -e

echo "[entrypoint] StoryLiner app container starting..."

# ── Wait for DB using Prisma client (available as production dep) ─────────────
MAX_TRIES=30
TRIES=0
echo "[entrypoint] Waiting for database to accept connections..."
until node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.\$connect()
  .then(() => p.\$disconnect())
  .catch(() => process.exit(1));
" 2>/dev/null; do
  TRIES=$((TRIES + 1))
  if [ "$TRIES" -ge "$MAX_TRIES" ]; then
    echo "[entrypoint] Database not reachable after $MAX_TRIES attempts. Exiting."
    exit 1
  fi
  echo "[entrypoint] Database not ready yet (attempt $TRIES/$MAX_TRIES), retrying in 3s..."
  sleep 3
done

echo "[entrypoint] Database is ready. Starting Next.js server..."
exec "$@"
