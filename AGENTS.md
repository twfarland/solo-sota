# AGENTS.md — pi-sota-harness (self-hosting map)

This repo is the Solo-SOTA Pi harness **and** is developed with it. Read this map first, then only the files the task needs.
Universal engineering law lives in `core/AGENTS.base.md` and applies here in full; where this file is silent, that file wins.

## Golden Commands
- **Verify baseline (run before and after every change):** `bash ./init.sh`
- **Unit tests (zero mocks):** `node --test`
- **Typecheck:** `npx tsc --noEmit`
- **Architecture linter:** `node ./overlays/ts-node/lint-architecture.mjs src extensions overlays bin scripts`
- **Context symmetry:** `node ./scripts/check-context-symmetry.mjs .`
- **New TODO comments:** `node ./scripts/check-todo-diff.mjs .`
- **Quint shallow gate:** `bash ./spec/scripts/check.sh`
- **Quint deep proof (pre-release, Java 17+):** `bash ./spec/scripts/prove.sh`
- **Load in Pi:** `pi --no-extensions -e ./extensions/solo-sota-harness.ts -e ./extensions/plan-quint-qa-modes.ts -e ./extensions/self-ratchet.ts --skill ./skills` (Pi 1.5.2: `--no-extensions` drops built-ins incl. MCP, explicit `-e` still loads; `--no-mcp` disables only built-in MCP)

Requires Node ≥ 23.6 (native TypeScript type stripping runs `.ts` tests directly) and bash.

## Repository Map
| Path | What it is | Read when |
| :--- | :--- | :--- |
| `README.md`, `docs/` | Public quickstarts, operational guides, publication checklist and evaluation proposal | Helping users or preparing a release |
| `CONTRIBUTING.md`, `SECURITY.md` | Contribution protocol, security boundaries and reporting | Public changes or vulnerability handling |
| `ARCHITECTURE.md` | Harness domain map, dependency direction, statechart invariants | Changing structure or adding a module |
| `ROADMAP.md` | Completed bootstrap status and deferred hardening findings | Checking known limitations or planning maintenance |
| `feature_list.json` | Immutable completed bootstrap acceptance history; not an application backlog | Auditing original acceptance |
| `claude-progress.txt` | Shift-to-shift handoff ledger (append-only) | Start and end of every shift |
| `core/AGENTS.base.md` | Language-agnostic guardrails (≤115 lines) copied into target repos | Always (it is the constitution) |
| `core/ARCHITECTURE.template.md` | Template for a target repo's `ARCHITECTURE.md` | Bootstrapping a target repo |
| `overlays/ts-node/OVERLAY.md` | TypeScript/Node translation of the core; the only distributed overlay | Working on target guidance or gates |
| `overlays/ts-node/lint-architecture.mjs` | Import-boundary linter with remediation output (also lints this repo) | Touching module boundaries |
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
| `/reload-harness` | Rechecks queued self-verification (including cancellation), then `ctx.reload()`; bare/stale requests are refused | — |

## Mechanical Guards (always on)
These are intended policies, not a sandbox guarantee. Known enforcement gaps and release blockers are tracked in `ROADMAP.md`; green gates do not erase them.
- **Path guard:** blocks `.env*`, `.git/`, `node_modules/`, horizontal-layer folders (`controllers/`, `repositories/`, `utils/`…) and bucket names (`*Impl`, `*Manager`, `*Helper`, `utils`…).
- **TODO guard:** new comment markers require `TODO(owner): reason`; unchanged malformed markers in the same file are grandfathered. The Git diff gate checks working-tree changes and untracked files against HEAD.
- **Content guard:** blocks mocking-library usage (mockk, mockito, `jest.mock`, `vi.mock`, sinon, `unittest.mock`, mockall).
- **Feature-list contract:** blocks changes outside top-level `"passes"`; approval requires current QA evidence for that selected feature and exact backlog snapshot.
- **Gate evidence:** recognized tool gates, slash-command gates and self-verification share one ledger; later checks/mutations/session changes revoke approval. Branch-local strikes survive reload; green proof does not.
- **2-strike cap:** two consecutive failing deterministic gates (`init.sh`, `node --test`, `tsc`, `check.sh`…) block all file mutation until a human message arrives.
- **Architecture-sensor guard:** edits to `ArchitectureTest*` / `lint-architecture*` need operator confirmation.
- **Plan/QA modes:** mutating shell commands are blocked; QA may edit only `feature_list.json`.
- **LocalContextMiddleware:** the first time a subtree is touched, its nested `AGENTS.md` is appended to the tool result.

## Working Rules for This Repo
1. **Decisions are pure.** New behaviour goes into `src/rules/` as a pure function with a `node --test` test written first. Extensions only read/write the world and call rules.
2. **Model what is stateful.** If you change the mode statechart or the strike cap, update `spec/harness_lifecycle.qnt` and `.md` in the same change and keep `bash ./spec/scripts/check.sh` green.
3. **Self-fixtures.** Tests that need mocking-library text assemble it from fragments (see `mockFixture` in `guardrail-rules.test.ts`) so the harness can still edit its own tests.
4. **The ratchet only tightens.** Never loosen a guard, linter rule, invariant, or test to land a change.
5. **Handoff.** End every shift by appending to `claude-progress.txt`: what changed, gate results, next step.
6. **Current scope.** All seven bootstrap features passed QA. Support TypeScript/Node only; preserve completed acceptance and append-only history rather than rewriting old criteria. HARN-003…005 remain deferred, not prerequisites for use. Never weaken general guards or claim a sandbox.

## Shift Protocol
1. `bash ./init.sh` must be green before you start; if not, fixing it is the task.
2. Read `claude-progress.txt` (latest entry), `ROADMAP.md`, and the active item's acceptance criteria (or `feature_list.json` when resuming bootstrap).
3. Write the failing deterministic test, implement, re-run `./init.sh`.
4. Append the handoff entry. Leave `"passes"` alone; `/qa` decides.

## Stages
- **Stage 1 (BOOT-001…004):** seed harness — bootstrapped by an external agent.
- **Stage 2 (BOOT-005…007):** complete, QA passed. Post-bootstrap distribution is TypeScript/Node-only by operator request; historical criteria are preserved.
- **Deferred hardening:** HARN-001/002 reviewed; HARN-003…005 findings remain in `ROADMAP.md`, without blocking bootstrap.
