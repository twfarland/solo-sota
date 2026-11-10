# Harness Lifecycle — Plain-Text Model

Companion to `harness_lifecycle.qnt`. Keep both in sync with `src/rules/strike-rules.ts` and `src/rules/harness-mode-rules.ts`.

## State
| Field | Meaning |
| :--- | :--- |
| `phase` | `Plan` (read-only), `ShiftBuild` (implementing), `QaEval` (evaluating), `HaltedForHuman` (2-strike cap hit) |
| `strikes` | consecutive deterministic-gate failures in the current shift (0..2) |
| `checksGreen` | last deterministic gate result |
| `filesMutated` | files changed since the last gate run |
| `featureMarkedPass` | the active feature's `"passes"` is `true` |

Initial: `Plan`, 0 strikes, checks green, nothing mutated, not passing.

## Transitions
| Action | Guard | Effect | Code |
| :--- | :--- | :--- | :--- |
| `startShift` | `Plan` or `HaltedForHuman` | → `ShiftBuild`, strikes 0 | `/shift`; human input resets `INITIAL_SHIFT` |
| `mutateCode` | `ShiftBuild`, strikes < 2 | mutated, checks red, pass cleared | `evaluateMutationUnderStrikes` |
| `deterministicGatePass` | `ShiftBuild`, mutated | checks green, strikes 0 | `recordGateOutcome(_, "pass")` |
| `deterministicGateFail` | `ShiftBuild`, mutated | checks red, strikes+1; at 2 → `HaltedForHuman` | `recordGateOutcome(_, "fail")` |
| `enterQa` | `ShiftBuild`, green, unmutated, strikes < 2 | → `QaEval` | `/qa` (re-runs `./init.sh`) |
| `qaApproveAndMarkPass` | `QaEval`, green, unmutated | pass marked | `evaluateModeToolCall` on `feature_list.json` |
| `qaRejectToShift` | `QaEval` | → `ShiftBuild`, pass cleared | `/shift` again |

## Invariants
- `inv_no_unverified_pass` — a feature is marked passing only in `QaEval` with green checks and no unverified mutations.
- `inv_strike_cap_enforced` — strikes ≤ 2, and 2 strikes ⇒ `HaltedForHuman`.
- `inv_teeth_can_reach_pass` (teeth) — `not(featureMarkedPass)`; must be violated, proving the happy path is reachable.

## Scenario Tests
- `happyPathTest` — init → shift → mutate → gate pass → QA → mark pass.
- `twoStrikeHaltTest` — init → shift → (mutate → gate fail) × 2 ⇒ halted with 2 strikes.
