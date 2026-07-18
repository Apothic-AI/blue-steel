#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$SKILL_DIR/.venv"
ADDONS_DIR="$SKILL_DIR/addons"
CONTAINER_PROXY_XPI="$ADDONS_DIR/container-proxy.xpi"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required but was not found on PATH" >&2
  exit 1
fi

if [[ ! -x "$VENV/bin/python" ]]; then
  uv venv --python 3.13 "$VENV"
fi

uv pip install --python "$VENV/bin/python" \
  'cloverlabs-camoufox==0.6.0' \
  'playwright==1.51.0' \
  'selenium>=4.45,<5'

"$VENV/bin/python" -m camoufox sync
"$VENV/bin/python" -m camoufox set official/stable
"$VENV/bin/python" -m camoufox fetch

mkdir -p "$ADDONS_DIR"
if [[ ! -f "$CONTAINER_PROXY_XPI" ]]; then
  curl --fail --location --silent --show-error \
    'https://addons.mozilla.org/firefox/downloads/latest/container-proxy/latest.xpi' \
    --output "$CONTAINER_PROXY_XPI"
fi

"$VENV/bin/python" - "$CONTAINER_PROXY_XPI" <<'PY'
import json
import sys
import zipfile

expected = "contaner-proxy@bekh-ivanov.me"
with zipfile.ZipFile(sys.argv[1]) as archive:
    manifest = json.loads(archive.read("manifest.json"))
actual = manifest["applications"]["gecko"]["id"]
if actual != expected:
    raise SystemExit(f"Unexpected Container Proxy ID: {actual}")
print(f"Container Proxy ready: {actual}")
PY

echo "Blue Steel Camoufox runtime ready: $VENV"
