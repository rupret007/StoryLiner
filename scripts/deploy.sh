#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# StoryLiner one-command deploy script (Unix / macOS / WSL)
# Usage: bash scripts/deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HEALTH_URL="http://localhost:3000/api/health"
HEALTH_TIMEOUT=120   # seconds to wait for the app to be healthy
COMPOSE_FILE="compose.yaml"

# ── Detect compose binary ─────────────────────────────────────────────────────
if command -v podman &>/dev/null && podman compose version &>/dev/null 2>&1; then
  COMPOSE="podman compose"
elif command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  echo ""
  echo "ERROR: Neither 'podman compose' nor 'docker compose' was found."
  echo "Install Podman Desktop (podman.io) or Docker Desktop and ensure the"
  echo "Compose extension is enabled."
  exit 1
fi

echo ""
echo "Using compose binary: $COMPOSE"
echo ""

# ── Ensure .env exists ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

if [ ! -f ".env" ]; then
  echo "No .env file found — copying .env.example to .env..."
  cp .env.example .env
  echo ""
  echo "IMPORTANT: Review .env and add any real API keys you need."
  echo "  - LLM_ADAPTER and SOCIAL_ADAPTER default to 'mock', which works out of the box."
  echo "  - DATABASE_URL is already set correctly for compose (host = 'db')."
  echo ""
  echo "Press ENTER to continue with the current .env, or Ctrl-C to edit it first."
  read -r
fi

# ── Start the stack ───────────────────────────────────────────────────────────
echo "Starting StoryLiner stack (db + app + worker)..."
$COMPOSE -f "$COMPOSE_FILE" up -d --build

echo ""
echo "Waiting for app to become healthy (up to ${HEALTH_TIMEOUT}s)..."
echo "(Includes time for schema migration to complete on first run.)"

ELAPSED=0
INTERVAL=5
until curl -sf "$HEALTH_URL" >/dev/null 2>&1; do
  if [ "$ELAPSED" -ge "$HEALTH_TIMEOUT" ]; then
    echo ""
    echo "ERROR: App did not become healthy within ${HEALTH_TIMEOUT}s."
    echo "Check logs with: $COMPOSE logs -f app"
    exit 1
  fi
  printf "."
  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo ""
echo "App is healthy."

# ── Seed the database ─────────────────────────────────────────────────────────
echo ""
echo "Seeding the database (safe to re-run — all upserts)..."
# Uses the 'migrate' service image which has the full dev deps (tsx, prisma CLI)
$COMPOSE -f "$COMPOSE_FILE" run --rm migrate npx tsx prisma/seed.ts

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo "  StoryLiner is running at http://localhost:3000"
echo ""
echo "  Useful commands:"
echo "    $COMPOSE logs -f          # stream all logs"
echo "    $COMPOSE logs -f app      # app logs"
echo "    $COMPOSE down             # stop (keeps DB data)"
echo "    $COMPOSE down -v          # stop + wipe DB"
echo "════════════════════════════════════════════════════════"
echo ""
