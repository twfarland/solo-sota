#!/usr/bin/env bash
# Idempotent environment + test + Quint sanity gate for pi-sota-harness.
# Safe to run repeatedly; exits non-zero on the first failing stage.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
export PATH="$PWD/node_modules/.bin:$PATH"

stage() { echo; echo "=== [init] $* ==="; }

stage "1/5 Environment"
if ! command -v node >/dev/null 2>&1; then
  echo "❌ node not found. Install Node >= 23.6."
  exit 1
fi
node -e '
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 23 || (maj === 23 && min < 6)) {
    console.error(`❌ Node ${process.versions.node} lacks native TypeScript type stripping; need >= 23.6.`);
    process.exit(1);
  }
  console.log(`node ${process.versions.node}`);
'
if [ ! -x node_modules/.bin/tsc ] || [ ! -x node_modules/.bin/quint ] || [ package.json -nt node_modules/.package-lock.json ]; then
  echo "Installing dev dependencies..."
  if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
fi

stage "2/5 TypeScript typecheck"
tsc --noEmit -p tsconfig.json
echo "✅ typecheck clean"

stage "3/5 Unit tests (node --test, zero mocks)"
node --test

stage "4/5 Architecture linter"
node ./overlays/ts-node/lint-architecture.mjs src extensions overlays

stage "5/5 Quint shallow gate"
bash ./spec/scripts/check.sh

echo
echo "✅ [init] Harness baseline green."
