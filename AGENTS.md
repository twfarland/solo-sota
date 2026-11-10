# AGENTS.md — pi-sota-harness (self-hosting map)

This repo is the Solo-SOTA Pi harness **and** is developed with it. Read this map first, then only the files the task needs.
Universal engineering law lives in `core/AGENTS.base.md` and applies here in full; where this file is silent, that file wins.

## Golden Commands
- **Verify baseline (run before and after every change):** `bash ./init.sh`
- **Unit tests (zero mocks):** `node --test`
- **Typecheck:** `npx tsc --noEmit`
- **Architecture linter:** `node ./overlays/ts-node/lint-architecture.mjs src extensions overlays`
- **Quint shallow gate:** `bash ./spec/scripts/check.sh`
- **Quint deep proof (pre-release, Java 17+):** `bash ./spec/scripts/prove.sh`
- **Load in Pi:** `pi --no-extensions -e ./extensions/solo-sota-harness.ts -e ./extensions/plan-quint-qa-modes.ts -e ./extensions/self-ratchet.ts` (Pi 1.0 has no `--no-mcp`; `--no-extensions` drops built-ins incl. MCP, explicit `-e` still loads)

Requires Node ≥ 23.6 (native TypeScript type stripping runs `.ts` tests directly) and bash.

## Repository Map
| Path | What it is | Read when |
| :--- | :--- | :--- |
| `ARCHITECTURE.md` | Harness domain map, dependency direction, statechart invariants | Changing structure or adding a module |
| `feature_list.json` | Immutable backlog. Only `"passes"` may change, only via `/qa` | Starting a shift |
| `claude-progress.txt` | Shift-to-shift handoff ledger (append-only) | Start and end of every shift |
| `core/AGENTS.base.md` | Language-agnostic guardrails (≤115 lines) copied into target repos | Always (it is the constitution) |
| `core/ARCHITECTURE.template.md` | Template for a target repo's `ARCHITECTURE.md` | Bootstrapping a target repo |
| `overlays/<stack>/OVERLAY.md` | Stack translation of the core (kotlin-gradle, ts-node, rust-cargo) | Working in that stack |
| `overlays/ts-node/lint-architecture.mjs` | Import-boundary linter with remediation output (also lints this repo) | Touching module boundaries |
| `overlays/kotlin-gradle/*` | Parallel-safe Gradle init script, `ArchitectureTest` template | Kotlin targets |
| `src/rules/*.ts` | **Pure** decisions: guards, strike cap, mode statechart | Changing any harness behaviour |
| `extensions/*.ts` | **Thin** Pi adapters wiring rules to Pi events/commands | Changing Pi integration |
| `skills/*/SKILL.md` | Model-facing procedures (bounded contexts, Quint, anti-entropy) | The task matches the skill's routing |
| `spec/` | Quint models + gate scripts; see `spec/README.md` | State, ordering, or retry logic changed |

## Harness Commands (inside Pi)
| Command | Effect | Cost tier |
| :--- | :--- | :--- |
| `/init-harness` | Runs `./init.sh`; hands failures to the agent | zero LLM if green |
| `/plan <goal>` | Read-only exploration; writes only `plans/<goal>.md` | surgical, few turns |
| `/shift [FEATURE-ID]` | Implements one feature (default: first pending) | flat-rate subscription |
| `/qa [FEATURE-ID]` | Re-runs `./init.sh`; if green, adversarial review may flip `"passes"` | surgical, few turns |
| `/quint-sync <context>` | 6-step as-built model sync and bug hunt | high thinking |
| `/quint-check` | Shallow Quint gate | zero LLM if green |
| `/quint-prove` | Deep Quint proof (confirms first) | compute-heavy |
| `/ratchet <mistake>` | Turns a repeated mistake into a permanent mechanical check | high thinking |
| `/reload-harness` | `ctx.reload()`; queued by `verify_and_reload_harness` after a green `./init.sh` | — |

## Mechanical Guards (always on)
- **Path guard:** blocks `.env*`, `.git/`, `node_modules/`, horizontal-layer folders (`controllers/`, `repositories/`, `utils/`…) and bucket names (`*Impl`, `*Manager`, `*Helper`, `utils`…).
- **Content guard:** blocks mocking-library usage (mockk, mockito, `jest.mock`, `vi.mock`, sinon, `unittest.mock`, mockall).
- **Feature-list contract:** blocks any `feature_list.json` change other than `"passes"`; blocks marking a pass outside a green `/qa`.
- **2-strike cap:** two consecutive failing deterministic gates (`init.sh`, `node --test`, `tsc`, `check.sh`, gradle/cargo test…) block all file mutation until a human message arrives.
- **Architecture-sensor guard:** edits to `ArchitectureTest*` / `lint-architecture*` need operator confirmation.
- **Plan/QA modes:** mutating shell commands are blocked; QA may edit only `feature_list.json`.
- **LocalContextMiddleware:** the first time a subtree is touched, its nested `AGENTS.md` is appended to the tool result.

## Working Rules for This Repo
1. **Decisions are pure.** New behaviour goes into `src/rules/` as a pure function with a `node --test` test written first. Extensions only read/write the world and call rules.
2. **Model what is stateful.** If you change the mode statechart or the strike cap, update `spec/harness_lifecycle.qnt` and `.md` in the same change and keep `bash ./spec/scripts/check.sh` green.
3. **Self-fixtures.** Tests that need mocking-library text assemble it from fragments (see `mockFixture` in `guardrail-rules.test.ts`) so the harness can still edit its own tests.
4. **The ratchet only tightens.** Never loosen a guard, linter rule, invariant, or test to land a change.
5. **Handoff.** End every shift by appending to `claude-progress.txt`: what changed, gate results, next step.

## Shift Protocol
1. `bash ./init.sh` must be green before you start; if not, fixing it is the task.
2. Read `claude-progress.txt` (latest entry) and the feature's steps in `feature_list.json`.
3. Write the failing deterministic test, implement, re-run `./init.sh`.
4. Append the handoff entry. Leave `"passes"` alone; `/qa` decides.

## Stages
- **Stage 1 (BOOT-001…004):** seed harness — bootstrapped by an external agent.
- **Stage 2 (BOOT-005…007):** self-hosted — built with this harness's own `/shift`, `/quint-check`, `/qa`, `/ratchet`.
