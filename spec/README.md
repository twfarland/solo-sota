# spec/ — Quint Formal Models

Executable [Quint](https://github.com/informalsystems/quint) models of the stateful parts of this repo. Every `.qnt` file here is checked by both gates. `@informalsystems/quint` is a devDependency; the scripts put `node_modules/.bin` on `PATH`.

| File | Models | As-built code |
| :--- | :--- | :--- |
| `harness_lifecycle.qnt` (+ `.md`) | Plan → Shift → QA statechart, 2-strike cap, scoped approval, invalidation/reload | `src/rules/strike-rules.ts`, `src/rules/harness-mode-rules.ts`, gate-evidence rules |
| `gate_evidence.qnt` (+ `.md`) | Receipt identity, current evidence, overlapping gates, backlog snapshots and strike restoration | `src/rules/gate-evidence-rules.ts`, `extensions/gate-runtime.ts`, always-on gate owner |

## Conventions
- One `var s: State` record, `action init`, named actions, and `action step = any { ... }`.
- Safety invariants are `val inv_<name>` — things that must never happen.
- Every model has at least one teeth witness `val inv_teeth_<name> = not(<reachable good state>)`. The gates *expect* it to be violated; if it is not, the model is vacuous or stuck.
- Deterministic scenario tests are `run <name>Test = init.then(...).expect(...)`.
- Counterexample traces land in `spec/traces/*.itf.json` (git-ignored).

## Two Gates
| Gate | Command | What it runs | When |
| :--- | :--- | :--- | :--- |
| Shallow | `bash ./spec/scripts/check.sh` | `quint typecheck`, `quint test`, `quint run` (20 steps × 200 samples) on all safety invariants, teeth probes | Every shift touching `spec/` or `*Rules`; part of `./init.sh` |
| Deep | `bash ./spec/scripts/prove.sh` | `quint verify` (Apalache, Java 17+) per invariant to `QUINT_MAX_STEPS` (default 12), teeth probes | Pre-release or `/quint-prove` |

## The 6-Step Sync-and-Fix Loop
Full protocol: `skills/quint-formal-modeling/SKILL.md`.
1. **Sync** the model to the as-built code (`spec/<context>.md` + `.qnt`), adding invariants and a teeth witness.
2. **Simulate** with `check.sh` first; reserve `prove.sh` for releases.
3. **Inspect** the counterexample trace in `spec/traces/`.
4. **Reproduce** it as a deterministic failing test at the lowest layer (pure Rules test, or Service test with `InMemory*` + `TestClock`).
5. **Fix** the domain rule (prefer making the bad state unrepresentable) until the test and architecture sensors pass.
6. **Re-sync** the model to the fixed code and re-run `check.sh` until green.
