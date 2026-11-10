#!/usr/bin/env bash
# Quint Deep Proof Gate: exhaustive bounded model checking (quint verify / Apalache) + teeth probes.
# Compute-intensive; run before releases or via /quint-prove. Requires Java 17+.
set -euo pipefail

SPEC_DIR="${1:-spec}"
MAX_STEPS="${QUINT_MAX_STEPS:-12}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$ROOT/node_modules/.bin:$PATH"
mkdir -p "$SPEC_DIR/traces"

if ! command -v quint >/dev/null 2>&1; then
  echo "❌ [Quint Prove] '@informalsystems/quint' not found. Install via: npm install (devDependency) or npm i -g @informalsystems/quint"
  exit 1
fi

if ! command -v java >/dev/null 2>&1; then
  echo "❌ [Quint Prove] Java 17+ is required for Apalache/TLC model checking."
  exit 1
fi

shopt -s nullglob
for qnt in "$SPEC_DIR"/*.qnt; do
  base=$(basename "$qnt" .qnt)
  echo "=== [Quint Deep Proof] Exhaustive Model Check ($qnt, max-steps=$MAX_STEPS) ==="
  quint typecheck "$qnt"

  for inv in $(grep -o "val inv_[a-zA-Z0-9_]*" "$qnt" | awk '{print $2}'); do
    if [[ "$inv" == inv_teeth_* ]]; then
      echo "🦷 [Teeth Probe] Confirming witness '$inv' is reachable (expecting violation)..."
      # Only a genuine '[violation]' counts: errors such as an unknown invariant name must not pass as teeth.
      probe=$(quint run --invariant="$inv" --max-steps=20 "$qnt" 2>&1 || true)
      if ! grep -q "^\[violation\]" <<<"$probe"; then
        echo "❌ [Teeth Failure] Witness '$inv' was NEVER violated! Model may be vacuously true or stuck."
        exit 1
      fi
      echo "✅ [Teeth Probe] Witness '$inv' bit as expected (state is reachable)."
    else
      echo "🔒 [Formal Proof] Verifying invariant '$inv' across all states up to depth $MAX_STEPS..."
      quint verify \
        --invariant="$inv" \
        --max-steps="$MAX_STEPS" \
        --out-itf="$SPEC_DIR/traces/${base}_${inv}_counterexample.itf.json" \
        "$qnt"
    fi
  done
done

echo "✅ [Quint Deep Proof] All formal invariants discharged and teeth probes verified."
