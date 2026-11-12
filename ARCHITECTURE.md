# ARCHITECTURE.md — pi-sota-harness

## 1. Purpose
A Pi package that turns a solo operator's coding agent into a disciplined, low-cost, self-improving engineering loop: mechanical guardrails, a Plan → Shift → QA statechart, Quint formal gates, and a `/ratchet` that tightens the harness from observed failures. Bootstrap is complete. The supported distribution is TypeScript/Node-only; completed acceptance history and deferred enforcement gaps remain in `feature_list.json` and `ROADMAP.md`. Installation provides guidance and gates, not security certification.

## 2. Modules & Dependency Direction
```text
extensions/  (Pi adapters: events, commands, tools, fs, exec)
bin/         (bootstrap CLI: arguments, asset reads, filesystem writes)
scripts/     (read-only repository checks: filesystem inventory and diagnostics)
    │  imports
    ▼
src/rules/   (pure decisions: value in → value out; std-lib path only)
```
`src/rules` never imports `extensions/`, Pi, `node:fs`, `child_process`, the clock, or randomness. `overlays/ts-node/lint-architecture.mjs` enforces this on every `./init.sh`.

| Module | Role | Responsibility |
| :--- | :--- | :--- |
| `src/rules/context-symmetry-rules.ts` | domain (pure) | Filename inventory → missing contract findings and concrete sibling remediation |
| `scripts/check-context-symmetry.mjs` | adapter | Read-only directory traversal, generated/dependency/link exclusions, findings → CLI exit code |
| `src/rules/bootstrap-rules.ts` | domain (pure) | TypeScript-only bootstrap arguments, fixed asset manifest, AGENTS/init rendering and shared runtime resource paths |
| `bin/apply-harness.mjs` | adapter | Resolves assets relative to itself; preflights destination conflicts/symlinks; installs missing files without overwriting |
| `src/rules/project-bootstrap-rules.ts` | domain (pure) | Fresh-project arguments and manifest: strict toolchain, machine-local Pi resources, starter runtime contract and setup docs |
| `bin/create-project.mjs` | adapter | Refuses existing/linked/nested targets; reuses installer, writes scaffold, initializes Git main without staging/committing or global changes |
| `src/rules/adoption-rules.ts` | domain (pure) | Existing-project preview, additive resource/context merges, ownership/conflict decisions and original-file backup plan |
| `bin/adopt-project.mjs` | adapter | Reads bounded destination snapshots, previews by default; refuses links/conflicts, rechecks write set and applies backup-first without executing project/Git commands |
| `scripts/check-todo-diff.mjs` | adapter | Read-only HEAD/working-tree snapshots and untracked text files → shared TODO guard diagnostics |
| `src/rules/guardrail-rules.ts` | domain (pure) | Path guard, mocking-content guard, diff-aware TODO comment guard, feature-list contract, plan-mode shell/write gates, tool-input parsing (`parseFileMutation`), local-context directory resolution |
| `src/rules/strike-rules.ts` | domain (pure) | 2-strike cap statechart (`ShiftState`), deterministic-gate command recognition, status text |
| `src/rules/gate-evidence-rules.ts` | domain (pure) | Run receipts, evidence revisions/purposes, backlog snapshots, abort outcomes and branch strike restoration |
| `extensions/gate-runtime.ts` | adapter | Shared direct-execution reporter and synchronous ledger query; fails closed without an initialized owner |
| `src/rules/harness-mode-rules.ts` | domain (pure) | Mode statechart (`HarnessMode`), pass-marking contract, feature-list parsing/selection, plan-file naming |
| `extensions/solo-sota-harness.ts` | adapter | Owns the gate ledger for Bash/PowerShell/direct reports; restores branch strikes; file/context guards and status |
| `extensions/plan-quint-qa-modes.ts` | adapter | `/init-harness`, `/plan`, `/shift`, `/qa`, `/quint-sync`, `/quint-check`, `/quint-prove`; architecture-sensor confirm |
| `extensions/self-ratchet.ts` | adapter | `/ratchet`, `verify_and_reload_harness` tool, `/reload-harness` (`ctx.reload()`) |
| `overlays/ts-node/*` | distributable | TypeScript/Node guidance and architecture sensor; no other stack assets are shipped |
| `skills/*` | distributable | Model-facing procedures |
| `docs/*`, `CONTRIBUTING.md`, `SECURITY.md` | documentation | Public setup/runtime/check boundaries, adoption, publishing and proposed independent evaluation |
| `.github/workflows/verify.yml` | CI adapter | Pinned actions and read-only permissions; full Node 24 gate on Ubuntu/Windows, no publication |
| `spec/*` | formal | Quint models and gate scripts |

Fresh projects use `node bin/create-project.mjs --target <new-directory>` (also
`npm run create-project -- --target ...`). The adapter uses the existing installer
rather than duplicating its asset manifest. It clears inherited Git environment
overrides and disables Git templates for initialization; it neither sets identity
nor grants Pi trust. The generated local settings reference this checkout and are
ignored by Git. Initialization is not transactional; partial output is retained on
failure for inspection. Project-specific acceptance/models are not manufactured.

Existing projects use `npm run adopt-project -- --target <repo>` for a read-only
preview and add `--apply` to opt in. Pure adoption rules preserve project-owned
architecture/gates, append managed guidance to the effective context file and merge
only runtime resource lists. Differing harness assets/ambiguous settings block all
writes. Original changed files are backed up locally; apply is not transactional or
a compatibility/verification certificate. No gate/mode statechart changes occur.
See `docs/adoption.md` for manual integration and inherited-resource limitations.

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
- File-tool approvals: each false→true feature transition is allowed **only** in `qa` with `checksGreen`, and only for that mode's selected feature ID. Net pass count is not authorization; Plan cannot write the backlog.
- `checksGreen` is refreshed from the authoritative gate ledger before every file-tool approval. Proof binds one QA run, selected feature, exact backlog snapshot and revision. A later gate (even successful), observed mutation, mode/branch/session change or proof consumption revokes it. An observed backlog mismatch is irreversible without a new QA run, even if the old text is restored.
- Direct gate executions and recognized Bash/PowerShell tool gates share one receipt path. Run IDs deduplicate completion; overlapping runs cannot mint proof. Only still-pending runs may complete: disposed/unknown receipts cannot change a restored branch's strikes or evidence. Killed/aborted/thrown checks fail. Generic gate success can reset one strike but cannot authorize QA.
- Strike state is restored from branch-local `solo-sota:strikes:v1` custom entries; proof is never persisted. Uninitialized owners withhold queries and restore before processing a real context. Genuine interactive/RPC input can clear strikes; synthetic extension input cannot.
- A queued reload requires its own still-current successful verification and non-cancelled signal at execution time. Shell/custom-tool mediation and exact file-effect prediction remain HARN-003/004 gaps, not an OS sandbox guarantee.

## 4. Formal Model ↔ Code
| Quint (lifecycle + gate-evidence models) | Code |
| :--- | :--- |
| `inv_strike_cap_enforced` | `ShiftState` union + `recordGateOutcome`; exhaustive test in `strike-rules.test.ts` |
| `inv_no_unverified_pass` | Guard-level `evaluateModeToolCall` → `evaluateFeatureListMutation`; `evaluateFeatureListEdit` (not a proof of shell effects) |
| `inv_qa_feature_scoped` / `selectedFeatureTest` | Per-ID newly-passing check against QA's selected ID; pure and adapter regression tests |
| `inv_teeth_can_reach_pass` | `/qa` happy path; `harness-mode-rules.test.ts` green-QA case |
| `twoStrikeHaltTest` / `happyPathTest` | mirrored by `strike-rules.test.ts` / `harness-mode-rules.test.ts` |
| `gate_evidence.qnt` invariants and scenarios | `gate-evidence-rules.test.ts`, recording adapter tests, and real Pi SDK integration with actual shell/edit tools and reload |

Public distribution remains experimental and source-loaded. The package stays
private for npm but is MIT-licensed. Install/adopt preserves the harness notice
at core/SOLO-SOTA-LICENSE without replacing an application's license. SDK 1.5.2
passes the real integration suite; CI also runs an advisory audit. CI configuration
is not evidence of a completed hosted run; the proposed outer
evaluator is separate from this harness and has no implementation/results here.

## 5. Cross-Cutting Decisions
- **Parse at the edge:** untyped Pi tool inputs become `FileMutation` / `ModeToolCall` once, in the adapter, via pure parsers. The feature-list edit guard requires both versions to be JSON arrays of features with string IDs/descriptions, string-array steps, and boolean passes. It compares parsed contracts after masking only top-level feature pass values, and additionally preserves the existing exact non-`passes` text restriction; nested fields remain immutable.
- **TODO ratchet:** `evaluateTodoDiffGuard` compares malformed comment-marker multisets in before/after text. File mutations check projected content; the Git adapter checks changed/untracked working-tree files against HEAD. Unchanged legacy markers are allowed, new copies and ownership regressions are not. This is a lightweight comment lexer, not a language parser; no workflow state or Quint model changed.
- **No mocks:** adapter suites share `extensions/recording-pi.fixture.ts`; the separate real Pi SDK suite uses an isolated session, real event bus, actual shell/edit tools and reload. Command-generated prompts are consumed at the input boundary; no provider requests are made.
- **Toolchain pinned as devDependencies:** `typescript`, `@informalsystems/quint`, `@earendil-works/pi-coding-agent` (types), `typebox`. Gate scripts prefer `node_modules/.bin`.
- **Windows-friendly:** all paths normalised to POSIX before rule evaluation; gates run under Git Bash.
- **Verification boundary:** the lifecycle model abstracts file-tool authorization, not all Pi I/O. Its companion and `spec/gate_evidence.md` list unmodeled adapter paths. Trusted project gates must propagate failures themselves; recognizing a gate command or receiving exit 0 does not prove arbitrary shell contents. Follow `ROADMAP.md` before describing enforcement as end-to-end.
- **Target bootstrapping (BOOT-005, QA passed):** `node bin/apply-harness.mjs --stack ts-node --target <repo>` installs core guidance, the TypeScript overlay, and target-specific gates. Other stack arguments fail before any filesystem write. Repeated identical installs are no-ops; differing files require a manual merge. Preflight avoids predictable partial installs, but installation is not transactional or safe against concurrent destination-tree changes. No target code, backlog, Pi settings, toolchain dependencies, or harness-specific Quint models are installed. Generated gate stages are separate fail-fast commands, not AND-lists whose failure could be masked by a later successful stage. `src/bootstrap-gates.test.ts` executes that control flow using controlled executables, without certifying external toolchains.
