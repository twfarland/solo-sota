#!/usr/bin/env bash
# Quint Shallow Gate: typecheck + deterministic spec tests + bounded random simulation.
# Runs in seconds; use during development shifts. Exhaustive checking lives in prove.sh.
set -euo pipefail

SPEC_DIR="${1:-spec}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$ROOT/node_modules/.bin:$PATH"
mkdir -p "$SPEC_DIR/traces"

if ! command -v quint >/dev/null 2>&1; then
  echo "❌ [Quint Check] '@informalsystems/quint' not found. Install via: npm install (devDependency) or npm i -g @informalsystems/quint"
  exit 1
fi

shopt -s nullglob
QNT_FILES=("$SPEC_DIR"/*.qnt)
if [ ${#QNT_FILES[@]} -eq 0 ]; then
  echo "ℹ️ [Quint Check] No .qnt files found in $SPEC_DIR."
  exit 0
fi

for qnt in "${QNT_FILES[@]}"; do
  base=$(basename "$qnt" .qnt)
  echo "=== [Quint Shallow Gate] 1/3 Type & Effect Checking: $qnt ==="
  quint typecheck "$qnt"

  echo "=== [Quint Shallow Gate] 2/3 Deterministic Spec Tests: $qnt ==="
  quint test "$qnt"

  invariants=$(grep -o "val inv_[a-zA-Z0-9_]*" "$qnt" | awk '{print $2}' | grep -v '^inv_teeth_' || true)
  witnesses=$(grep -o "val inv_teeth_[a-zA-Z0-9_]*" "$qnt" | awk '{print $2}' || true)

  if [ -n "$invariants" ]; then
    combined=$(echo "$invariants" | paste -sd'&' - | sed 's/&/ and /g')
    echo "=== [Quint Shallow Gate] 3/3 Random Simulator (max-steps=20, max-samples=200, invariant=$combined) ==="
    quint run \
      --invariant="$combined" \
      --max-steps=20 \
      --max-samples=200 \
      --out-itf="$SPEC_DIR/traces/${base}_shallow_violation.itf.json" \
      "$qnt"
  fi

  for inv in $witnesses; do
    echo "🦷 [Quint Shallow Gate] Teeth probe '$inv' (expecting a violation, i.e. the witnessed state is reachable)..."
    # Only a genuine '[violation]' counts: errors such as an unknown invariant name must not pass as teeth.
    probe=$(quint run --invariant="$inv" --max-steps=20 --max-samples=200 "$qnt" 2>&1 || true)
    if ! grep -q "^\[violation\]" <<<"$probe"; then
      echo "❌ [Teeth Failure] Witness '$inv' was NEVER violated! Model may be vacuously true or stuck."
      exit 1
    fi
    echo "✅ [Teeth Probe] Witness '$inv' bit as expected."
  done
done

echo "✅ [Quint Shallow Gate] All specifications typechecked, tested, and simulated cleanly."
