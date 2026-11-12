# Harness Lifecycle — Plain-Text Model

Companion to `harness_lifecycle.qnt`. Keep both in sync with `src/rules/strike-rules.ts`, `src/rules/harness-mode-rules.ts`, and `src/rules/gate-evidence-rules.ts`. See `gate_evidence.md` for the detailed receipt/revision model.

## State
| Field | Meaning |
| :--- | :--- |
| `phase` | `Plan` (read-only), `ShiftBuild` (implementing), `QaEval` (evaluating), `HaltedForHuman` (2-strike cap hit) |
| `strikes` | consecutive deterministic-gate failures in the current shift (0..2) |
| `checksGreen` | abstract verification availability; in QA, only current QA-purpose proof counts |
| `filesMutated` | files changed since the last gate run |
| `featureMarkedPass` | the current modeled approval decision is authorized, not a durable backlog pass flag |
| `selectedFeature` | QA's chosen feature (`FirstFeature` or `SecondFeature`) |
| `approvedFeature` | the feature marked by the latest approval transition |

Initial: `Plan`, 0 strikes, checks green, nothing mutated, not passing.

## Transitions
| Action | Guard | Effect | Code |
| :--- | :--- | :--- | :--- |
| `startShift` | `Plan` or `HaltedForHuman` | → `ShiftBuild`, strikes 0 | `/shift`; human input resets `INITIAL_SHIFT` |
| `mutateCode` | `ShiftBuild`, strikes < 2 | mutated, checks red, pass cleared | `evaluateMutationUnderStrikes` |
| `deterministicGatePass` | `ShiftBuild`, mutated | checks green, strikes 0 | `recordGateOutcome(_, "pass")` |
| `deterministicGateFail` | `ShiftBuild`, mutated | checks red, strikes+1; at 2 → `HaltedForHuman` | `recordGateOutcome(_, "fail")` |
| `enterQa` / `enterOtherQa` | `ShiftBuild`, green, unmutated, strikes < 2 | → `QaEval`, select first/second feature | `/qa <feature-id>` (re-runs `./init.sh`) |
| `qaApproveFeature` | `QaEval`, green, unmutated, requested feature equals selected feature | record the approved feature | `evaluateModeToolCall` checks every newly passing feature by ID, even in count-neutral swaps |
| `qaRejectToShift` | `QaEval` | → `ShiftBuild`, approval cleared | `/shift` again |
| `qaEvidenceInvalidated` | `QaEval` | clear authorization | observed mutation, changed feature/backlog or evidence consumption |
| `qaGateFail` | `QaEval` | revoke evidence; strike+1; halt at 2 | one shared receipt path for tool/direct gates |
| `qaOtherGatePass` | `QaEval` | reset a strike but revoke QA authorization | a generic check cannot restore QA-purpose proof |
| `runtimeReload` | any | revoke proof; preserve strikes/halt | branch entries restore strike state; uninitialized owners fail closed |

## Invariants
- `inv_no_unverified_pass` — a feature is marked passing only in `QaEval` with green checks and no unverified mutations.
- `inv_qa_feature_scoped` — the approved feature equals the selected QA feature.
- `inv_strike_cap_enforced` — strikes ≤ 2, and 2 strikes ⇒ `HaltedForHuman`.
- `inv_teeth_can_reach_pass` (teeth) — `not(featureMarkedPass)`; must be violated, proving the happy path is reachable.

## Scenario Tests
- `happyPathTest` — init → shift → mutate → gate pass → QA → mark pass.
- `twoStrikeHaltTest` — init → shift → (mutate → gate fail) × 2 ⇒ halted with 2 strikes.
- `selectedFeatureTest` — select the second feature, approve it, and verify its identity.
- `staleQaGateTest` — later failure revokes QA authorization.
- `reloadPreservesHaltTest` — repeated QA-time failures halt and reload cannot clear it.

## Proof Boundary / Known As-Built Gaps
This is a guard-level lifecycle abstraction, not a proof of all Pi tool effects.
The model has two representative feature IDs and models each new approval, not
net changes in the number of passing backlog entries. Pure regression tests also
cover pass-count-neutral swaps, Plan backlog isolation, and invalid lists.

This lifecycle now includes later QA-time failures, invalidation, generic gates,
and reload preserving a halt. Its initial green state abstracts a successful
baseline; the detailed ledger model starts uninitialized and without evidence.
`gate_evidence.qnt` covers receipts, revisions, concurrent gates and backlog snapshots.
The implementation counts command/tool/self-verification results through one owner;
real Pi SDK tests verify that wiring and branch-state restoration.

Arbitrary shell/custom-tool writes, filesystem aliasing, exact edit prediction,
and full branch/lifecycle behavior remain outside these abstractions. Clearing
`featureMarkedPass` means revoking the latest modeled permission, not rewriting a
previously approved backlog entry. See ROADMAP.md before making release claims.
