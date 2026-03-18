# ─────────────────────────────────────────────────────────────────────────────
# StoryLiner one-command deploy script (Windows PowerShell)
# Usage: pwsh scripts/deploy.ps1
# ─────────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"

$HEALTH_URL     = "http://localhost:3000/api/health"
$HEALTH_TIMEOUT = 120   # seconds to wait for the app to be healthy
$COMPOSE_FILE   = "compose.yaml"

# ── Detect compose binary ─────────────────────────────────────────────────────
$COMPOSE = $null

$hasPodman = Get-Command podman -ErrorAction SilentlyContinue
if ($hasPodman) {
  try {
    & podman compose version 2>$null | Out-Null
    $COMPOSE = "podman compose"
  } catch { }
}

if (-not $COMPOSE) {
  $hasDocker = Get-Command docker -ErrorAction SilentlyContinue
  if ($hasDocker) {
    try {
      & docker compose version 2>$null | Out-Null
      $COMPOSE = "docker compose"
    } catch { }
  }
}

if (-not $COMPOSE) {
  Write-Host ""
  Write-Host "ERROR: Neither 'podman compose' nor 'docker compose' was found." -ForegroundColor Red
  Write-Host "Install Podman Desktop (podman.io) or Docker Desktop and ensure the"
  Write-Host "Compose extension is enabled."
  exit 1
}

Write-Host ""
Write-Host "Using compose binary: $COMPOSE"
Write-Host ""

# ── Ensure .env exists ────────────────────────────────────────────────────────
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir   = Split-Path -Parent $scriptDir
Set-Location $rootDir

if (-not (Test-Path ".env")) {
  Write-Host "No .env file found — copying .env.example to .env..."
  Copy-Item ".env.example" ".env"
  Write-Host ""
  Write-Host "IMPORTANT: Review .env and add any real API keys you need." -ForegroundColor Yellow
  Write-Host "  - LLM_ADAPTER and SOCIAL_ADAPTER default to 'mock', which works out of the box."
  Write-Host "  - DATABASE_URL is already set correctly for compose (host = 'db')."
  Write-Host ""
  Write-Host "Press ENTER to continue with the current .env, or Ctrl-C to edit it first."
  Read-Host
}

# ── Start the stack ───────────────────────────────────────────────────────────
Write-Host "Starting StoryLiner stack (db + app + worker)..."
Invoke-Expression "$COMPOSE -f `"$COMPOSE_FILE`" up -d --build"

Write-Host ""
Write-Host "Waiting for app to become healthy (up to ${HEALTH_TIMEOUT}s)..."
Write-Host "(Includes time for schema migration to complete on first run.)"

$elapsed  = 0
$interval = 5

while ($true) {
  try {
    $response = Invoke-WebRequest -Uri $HEALTH_URL -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    if ($response.StatusCode -eq 200) { break }
  } catch { }

  if ($elapsed -ge $HEALTH_TIMEOUT) {
    Write-Host ""
    Write-Host "ERROR: App did not become healthy within ${HEALTH_TIMEOUT}s." -ForegroundColor Red
    Write-Host "Check logs with: $COMPOSE logs -f app"
    exit 1
  }

  Write-Host -NoNewline "."
  Start-Sleep -Seconds $interval
  $elapsed += $interval
}

Write-Host ""
Write-Host "App is healthy."

# ── Seed the database ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Seeding the database (safe to re-run — all upserts)..."
# Uses the 'migrate' service image which has the full dev deps (tsx, prisma CLI)
Invoke-Expression "$COMPOSE -f `"$COMPOSE_FILE`" run --rm migrate npx tsx prisma/seed.ts"

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  StoryLiner is running at http://localhost:3000"        -ForegroundColor Cyan
Write-Host ""
Write-Host "  Useful commands:"
Write-Host "    $COMPOSE logs -f          # stream all logs"
Write-Host "    $COMPOSE logs -f app      # app logs"
Write-Host "    $COMPOSE down             # stop (keeps DB data)"
Write-Host "    $COMPOSE down -v          # stop + wipe DB"
Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
