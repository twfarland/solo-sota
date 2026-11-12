# Gate Evidence — Ledger Model

Companion to `gate_evidence.qnt`, mirroring `src/rules/gate-evidence-rules.ts`.
`extensions/solo-sota-harness.ts` owns the ledger; command/self-verification gates
use `extensions/gate-runtime.ts` to report into that same owner.

## State and scope

The implementation has a revision, pending runs, completed receipt IDs, a strike
state, and either no evidence or one green run. Green evidence binds that run's
purpose: a generic check, or QA of a particular feature and exact backlog text.

The finite model uses two run IDs, two QA feature IDs, and a numeric backlog
version in place of the full text. Purpose 0 means a generic check; 1/2 mean QA
for those features. Slot maps remember each run's starting revision and backlog
version. IDs may be reused only after modeled session disposal, representing new
runtime identities rather than literal replay of old commands.

## Transitions

| Action | Meaning / implementation |
| :--- | :--- |
| `initialize` | Restore branch-local strikes before exposing state; proof starts empty |
| `start` | Revoke existing evidence, advance revision, record the run and its purpose |
| `finish` | Count a receipt at most once; only a successful, uninterrupted, sole pending run can mint evidence |
| `invalidate` | File mutation, relevant mode change or other observed invalidation advances the revision and clears proof |
| `backlogChanged` | Simulate an external backlog change; authorization compares the exact snapshot at use time |
| `chooseSecondFeature` | Mode changes revoke proof; another feature requires its own QA |
| `approve` | Require current QA-purpose proof for the selected feature and backlog |
| `operatorInput` | Interactive/RPC operator input clears strikes and revokes proof |
| `extensionInput` | Synthetic agent input cannot clear a halt |
| `reload` | Preserve branch strikes; drop initialization, pending runs, proof and queued reload identity |
| `queueReload` | Remember the successful generic self-verification run |
| `cancelReload` | Mark its signal cancelled, including after the queue was created |
| `executeReloadCheck` | Recheck current identity/proof and cancellation before allowing the queued reload |

The sampler also includes `successfulQaRoundTrip`, a macro for the legal,
uninterrupted start → successful completion → approval sequence. It makes the
useful path visible to the shallow random sampler among many invalidating events.
All fine-grained transitions remain available, including overlapping execution;
no safety invariant or interleaving is removed. Deterministic scenario tests cover
the individual events independently of that macro.

A failed, killed, pre-aborted, late-aborted or thrown direct execution is a failed
receipt. A successful generic gate can reset one strike, but cannot authorize QA.
An observed backlog mismatch also invalidates proof, even if the original text
is subsequently restored. A halted state is absorbing under gate success; it needs
genuine operator input.
Duplicate receipts are ignored. A completion without a still-pending matching
start is ignored entirely: a disposed run must not reset or add strikes, or revoke
another branch's proof. Both runtime command reports and tool hooks supply the
start before completion. Receipt IDs identify unique executions; the finite
model's reused IDs represent new identities after disposal, not literal replay.

## Invariants and scenarios

- `inv_green_is_current`: green requires initialization, no halt, no pending run,
  and the current revision.
- `inv_approval_has_matching_evidence`: approval requires QA-purpose proof matching
  the selected feature and backlog snapshot.
- `inv_reload_uses_live_check`: queued reload authorization requires live, matching,
  non-cancelled generic verification.
- `inv_strikes_bounded`: strikes stay within 0..2.
- `inv_teeth_approval_reachable`: must be violated, witnessing reachable approval.

Scenarios cover valid QA, later failure, overlapping runs, mutation during a run,
receipt replay, halt surviving reload plus extension-generated input, and valid,
stale and cancelled queued reload checks. Three additional scenarios cover late
success/failure after disposal and a late receipt preserving a newer QA approval.
Reload request values -1/0/1/2 abstract
no request / one of the two live run IDs / a cancelled signal, respectively.

## Evidence outside the abstraction

Real Pi SDK integration tests exercise the real event bus, direct shell checks,
nested Bash/edit hooks, cancelled self-verification, approval rejection, successful
approval, operator recovery, and actual reload. Both bound hosts and the SDK's
unbound reload path are covered. The latter withholds state until a real tool/input
context can restore the branch. No provider requests are made in these tests.

Persisted strike entries are branch-local, not a global cross-session lock. Green
proof is never persisted. The model does not prove OS isolation, arbitrary shell
semantics, custom-tool effects, path aliases, exact edit prediction, or all Pi
lifecycle/branching behaviors. Those remain HARN-003..005 in ROADMAP.md. In
particular, report-producing gates are trusted project commands: a zero shell
exit is not proof of every command inside an arbitrary script.
