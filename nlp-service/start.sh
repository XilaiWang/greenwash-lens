#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

pick_python() {
  local candidates=()

  if [ -n "${PYTHON_BIN:-}" ]; then
    candidates+=("$PYTHON_BIN")
  fi

  if command -v python3 >/dev/null 2>&1; then
    candidates+=("$(command -v python3)")
  fi

  if command -v python >/dev/null 2>&1; then
    candidates+=("$(command -v python)")
  fi

  candidates+=(
    "/opt/anaconda3/bin/python3"
    "/Library/Frameworks/Python.framework/Versions/3.13/bin/python3"
    "/usr/local/bin/python3"
    "/usr/bin/python3"
  )

  for candidate in "${candidates[@]}"; do
    [ -x "$candidate" ] || continue
    if "$candidate" - <<'PY' >/dev/null 2>&1
import importlib.util, sys
required = ["uvicorn", "fastapi", "transformers", "torch", "langdetect"]
missing = [name for name in required if importlib.util.find_spec(name) is None]
sys.exit(0 if not missing else 1)
PY
    then
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

PYTHON_RUNTIME="$(pick_python)" || {
  echo "No compatible Python runtime found for the NLP service."
  echo "Please install the dependencies with: pip install -r requirements.txt"
  exit 1
}

echo "Starting NLP service with: $PYTHON_RUNTIME"
exec "$PYTHON_RUNTIME" -m uvicorn main:app --host 127.0.0.1 --port 5174
