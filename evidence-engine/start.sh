#!/usr/bin/env bash
# Start the Evidence Engine Python sidecar on port 5176.
# Requires GEMINI_API_KEY in env (or in ~/.greenwash/.env).

set -euo pipefail

cd "$(dirname "$0")"

# Activate venv if present, otherwise rely on system python
if [[ -f .venv/bin/activate ]]; then
  source .venv/bin/activate
fi

# Check for API key
if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "ERROR: GEMINI_API_KEY is not set."
  echo "  Get one at https://aistudio.google.com/apikey"
  echo "  Then: export GEMINI_API_KEY=\"...\""
  exit 1
fi

# Default backend URL
export PHASE1_API_URL="${PHASE1_API_URL:-http://127.0.0.1:5173}"

echo "Starting Evidence Engine on http://127.0.0.1:5176"
echo "  PHASE1_API_URL=${PHASE1_API_URL}"

exec python -m uvicorn sidecar_server:app \
  --host 127.0.0.1 \
  --port 5176 \
  "$@"
