---
name: quint-formal-modeling
description: Model stateful workflows, concurrency, ordering, retries, and state machines in Quint (spec/*.qnt), run shallow/deep checks, and convert counterexample traces into deterministic unit/contract tests.
---

# Quint As-Built Sync & Temporal Bug-Finding Skill

## Routing Guidelines (When to Use vs. When NOT to Use)
- **USE THIS SKILL** when designing or debugging state machines, outbox/webhook retries, concurrent workflows, ordering invariants, or when invoking `/quint-sync`, `/quint-check`, or `/quint-prove`.
- **DO NOT USE THIS SKILL** for stateless CRUD endpoints, static UI styling, or trivial data formatting.

## The 6-Step Quint Loop (Mandatory Protocol)
1. **Sync Model to As-Built Code (`spec/<context>.md` & `spec/<context>.qnt`):**
   - Extract the state record (`var s: State`) and pure actions from `<Aggregate>Rules` and `<Context>Service`.
   - Write invariants (`val inv_<name> = ...`) stating what must NEVER happen (e.g., double-capture, stale reply overwriting newer query, orphaned outbox state) and at least one teeth witness (`val inv_teeth_<name> = not(...)`).
2. **Run Shallow Simulation First (`bash ./spec/scripts/check.sh`):**
   - Runs `quint typecheck`, `quint test`, and `quint run --max-steps=20 --max-samples=200`.
   - Reserve `bash ./spec/scripts/prove.sh` (`quint verify`) for pre-release gates or when explicitly requested via `/quint-prove`.
3. **Inspect Counterexample Trace (`spec/traces/*.itf.json`):**
   - When Quint violates an invariant, read the action sequence and nondeterministic picks (`mbt::actionTaken`, `mbt::nondetPicks`, or state transitions in the ITF JSON).
4. **Write a Deterministic Failing Test in Code BEFORE Fixing:**
   - Translate the exact state sequence from the Quint counterexample into a unit test on `<Aggregate>RulesTest` or a `<Context>ServiceTest` using `InMemory<Context>Store` and `TestClock`.
   - Run the single test and confirm it fails on the exact invariant violation Quint discovered.
5. **Fix the Domain Rule Until Green:**
   - Update `<Aggregate>` types (making the invalid state unrepresentable if possible) or `<Aggregate>Rules` guard conditions until the deterministic test and `ArchitectureTest` pass.
6. **Update the Quint Model & Re-Verify:**
   - Update `spec/<context>.qnt` so its action guard/effect matches the fixed code and re-run `bash ./spec/scripts/check.sh` until green.
