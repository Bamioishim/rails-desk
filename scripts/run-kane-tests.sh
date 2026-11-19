#!/usr/bin/env bash
# Run the committed Kane browser tests against BASE_URL.
# Credentials come from the environment (or a gitignored .env). Never commit them.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Load gitignored local env if present, without printing values.
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
BASE_URL="${BASE_URL%/}"
MARKER="https://preview.invalid"

if [[ -z "${LT_USERNAME:-}" || -z "${LT_ACCESS_KEY:-}" ]]; then
  echo "LT_USERNAME and LT_ACCESS_KEY must be set in the environment (or in a gitignored .env)." >&2
  echo "Copy the placeholders from .env.example. Do not commit real values." >&2
  exit 1
fi

if ! command -v kane-cli >/dev/null 2>&1; then
  echo "kane-cli is not on PATH. Install it with:" >&2
  echo "  npm install -g @testmuai/kane-cli@0.10.6" >&2
  exit 1
fi

# Authenticate from env without echoing the access key.
# A stored Kane profile is reused when whoami already succeeds.
if ! kane-cli whoami >/dev/null 2>&1; then
  kane-cli login --username "$LT_USERNAME" --access-key "$LT_ACCESS_KEY"
fi

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/rails-desk-kane.XXXXXX")"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

mkdir -p "$WORKDIR/tests/kane" "$WORKDIR/.testmuai"
cp "$ROOT/.testmuai/context.md" "$WORKDIR/.testmuai/context.md"

mapfile -t FILES < <(find "$ROOT/tests/kane" -maxdepth 1 -name '*_test.md' | sort)
if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "No tests found in tests/kane." >&2
  exit 1
fi

for src in "${FILES[@]}"; do
  dest="$WORKDIR/tests/kane/$(basename "$src")"
  python3 - "$src" "$dest" "$MARKER" "$BASE_URL" <<'PY'
import sys
from pathlib import Path
src, dest, marker, base = sys.argv[1:]
text = Path(src).read_text(encoding="utf-8")
if marker not in text:
    raise SystemExit(f"Preview URL marker missing from {src}")
Path(dest).write_text(text.replace(marker, base), encoding="utf-8")
PY
done

echo "Running ${#FILES[@]} Kane tests against $BASE_URL"
cd "$WORKDIR"
# Pass credentials from the environment already loaded above; do not print them.
kane-cli testrun run tests/kane/*_test.md \
  --headless \
  --agent \
  --on-failure continue \
  --parallel 1 \
  --name "${KANE_RUN_NAME:-Rails Desk Kane browser tests}"
