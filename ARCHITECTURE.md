# ARCHITECTURE.md — pi-sota-harness

## 1. Purpose
A Pi package that turns a solo operator's coding agent into a disciplined, low-cost, self-improving engineering loop: mechanical guardrails, a Plan → Shift → QA statechart, Quint formal gates, and a `/ratchet` that tightens the harness from observed failures.

## 2. Modules & Dependency Direction
```text
extensions/  (Pi adapters: events, commands, tools, fs, exec)
    │  imports
    ▼
src/rules/   (pure decisions: value in → value out; std-lib path only)
```
`src/rules` never imports `extensions/`, Pi, `node:fs`, `child_process`, the clock, or randomness. `overlays/ts-node/lint-architecture.mjs` enforces this on every `./init.sh`.

| Module | Role | Responsibility |
| :--- | :--- | :--- |
| `src/rules/guardrail-rules.ts` | domain (pure) | Path guard, mocking-content guard, feature-list contract, plan-mode shell/write gates, tool-input parsing (`parseFileMutation`), local-context directory resolution |
| `src/rules/strike-rules.ts` | domain (pure) | 2-strike cap statechart (`ShiftState`), deterministic-gate command recognition, status text |
| `src/rules/harness-mode-rules.ts` | domain (pure) | Mode statechart (`HarnessMode`), pass-marking contract, feature-list parsing/selection, plan-file naming |
| `extensions/solo-sota-harness.ts` | adapter | Always-on guards, strike tracking from bash results, LocalContextMiddleware, status bar |
| `extensions/plan-quint-qa-modes.ts` | adapter | `/init-harness`, `/plan`, `/shift`, `/qa`, `/quint-sync`, `/quint-check`, `/quint-prove`; architecture-sensor confirm |
| `extensions/self-ratchet.ts` | adapter | `/ratchet`, `verify_and_reload_harness` tool, `/reload-harness` (`ctx.reload()`) |
| `overlays/*` | distributable | Stack translations of `core/AGENTS.base.md`, sensors, parallel-isolation scripts |
| `skills/*` | distributable | Model-facing procedures |
| `spec/*` | formal | Quint models and gate scripts |

## 3. Statecharts
### Shift strike cap (`ShiftState`)
```text
building(0) ──fail──▶ building(1) ──fail──▶ haltedForHuman
     ▲  ▲                 │                     │
     │  └──────pass───────┘                     │
     └──────────────── human input ─────────────┘
```
`haltedForHuman` blocks every write/edit (and terminates the tool batch). The union makes "2 strikes while building" unrepresentable.

### Harness mode (`HarnessMode`)
`normal | plan(planFile) | shift(featureId) | quint(target) | qa(featureId, checksGreen)`
- `plan`: shell must be read-only; writes only to `planFile`.
- `qa`: shell must be read-only; edits only to `feature_list.json`.
- Any mode: increasing the count of `"passes": true` is allowed **only** in `qa` with `checksGreen` (which `/qa` sets from a fresh `./init.sh`).

## 4. Formal Model ↔ Code
| Quint (`spec/harness_lifecycle.qnt`) | Code |
| :--- | :--- |
| `inv_strike_cap_enforced` | `ShiftState` union + `recordGateOutcome`; exhaustive test in `strike-rules.test.ts` |
| `inv_no_unverified_pass` | `evaluateModeToolCall` → `evaluateFeatureListMutation`; `evaluateFeatureListEdit` |
| `inv_teeth_can_reach_pass` | `/qa` happy path; `harness-mode-rules.test.ts` green-QA case |
| `twoStrikeHaltTest` / `happyPathTest` | mirrored by `strike-rules.test.ts` / `harness-mode-rules.test.ts` |

## 5. Cross-Cutting Decisions
- **Parse at the edge:** untyped Pi tool inputs become `FileMutation` / `ModeToolCall` once, in the adapter, via pure parsers.
- **No mocks:** extension tests drive the real extension factories against a hand-written recording fake of the Pi API (`extensions/extensions.test.ts`).
- **Toolchain pinned as devDependencies:** `typescript`, `@informalsystems/quint`, `@earendil-works/pi-coding-agent` (types), `typebox`. Gate scripts prefer `node_modules/.bin`.
- **Windows-friendly:** all paths normalised to POSIX before rule evaluation; gates run under Git Bash.
