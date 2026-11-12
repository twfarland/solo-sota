# Operating Scope and Deferred Hardening

## Decision and scope

**Bootstrap complete:** all seven original features passed QA. There is no next
bootstrap item. The operator explicitly kept HARN-003…005 out of that finish line.

**Current support:** TypeScript/Node only. The operator requested removal of the
other stack assets after bootstrap. Installer choices, gate fixtures, context
symmetry and current usage documentation now follow that narrowed scope.

`feature_list.json` is immutable historical acceptance evidence. Its original
criteria and all passing flags are preserved, not rewritten to describe today's
smaller distribution. `claude-progress.txt` remains append-only. General guard
protections remain intact even where they recognize commands or patterns outside
the supported installer stack.

**Deferred:** HARN-003…005 findings remain real; a green bootstrap suite is not a
security/sandbox certification. Do not start these tasks without operator intent.

## Using the harness now

- Follow README.md for source loading, project setup and reload instructions.
- `/shift` finds no pending task in this checkout's completed bootstrap list.
  Applications need their own operator-established backlog, not a copy of this one.
- `/plan <goal>` writes a plan; explicit maintenance tasks can improve this repo.
- `/shift HARN-*` and `/qa HARN-*` do not resolve this document's IDs.
- Any future backlog migration must be operator-owned and preserve guard/QA
  protections. No global Pi configuration change is necessary for source loading.

## Public distribution and measurement

The source is being prepared for public GitHub sharing, not an npm release.
Setup/adoption/runtime/check guides, contribution/security guidance and a pinned
Node 24 Ubuntu/Windows verification workflow are provided. The owner selected MIT
and the canonical repository is https://github.com/twfarland/solo-sota. Private
reporting setup, publication approval and actual hosted CI results remain
maintainer steps. The package stays private for npm, with MIT metadata/notices.
The SDK was upgraded from 1.0.0 to 1.5.2; all functional tests pass and npm audit
reports zero findings, resolving the four earlier affected package entries. CI
now checks advisories too. This is point-in-time evidence, not a sandbox claim.

No independent performance advantage over vanilla Pi or Claude Code is established.
`docs/evaluation.md` describes a separate outer evaluator proposal, not an implemented
benchmark or another automatic harness-hardening prerequisite.

## Audit evidence (2026-11-10)

Baseline was green: 66 tests, typecheck, architecture lint, and Quint shallow gate.
Source review plus adversarial probes nevertheless found these gaps:

| Finding | Evidence | Disposition |
| :--- | :--- | :--- |
| Approval by net pass count | A true→false / false→true swap was allowed outside green QA; green QA could approve a different ID | Fixed in HARN-001; pure tests reproduced failures first, adapter regression now covers wiring |
| Plan could edit the backlog | Feature-list handling ran before Plan's write restriction, including regressions and no-ops | Fixed in HARN-001 |
| Stale green QA | Recording-Pi probe: run green `/qa X`, emit a failed `node --test` result, then request X's pass; request still allowed | Repaired in HARN-002 for observed gate/file-tool paths; recording and real SDK regressions pass; scoped review complete |
| Gate reporting is fragmented | `plan-quint-qa-modes.ts` and `self-ratchet.ts` called `pi.exec` outside tool-result accounting | One ledger/reporting path now handles command, recognized tool and self-verification gates; real Pi SDK verifies completion counts |
| Shell bypass | Recording-adapter probe: after two gate failures the always-on guard allowed a Bash mutation request; pure Plan probe allowed an interpreter write command (neither payload executed) | Open, HARN-003 |
| Path bypass | Pure probes: `evaluatePathGuard("config/.env.local")` and `evaluatePathGuard("../outside.ts")` returned allowed | Open, HARN-003 |
| Inexact feature-list contract | Changing `metadata.passes` in a valid list was accepted by the regex stripping all passes text | Nested-field bypass fixed during HARN-001 review; ambiguous JSON keys and effective edit/content contracts remain HARN-004 |
| Edit prediction differs from tool contract | `applyEdits` applies replacements sequentially; this session's edit tool matches independent edits against the original | Source-level compatibility gap; reproduce with the supported real tool schema in HARN-004 |
| Abandoned completion changes restored strikes | Review regressions: start a gate → tree navigation → old success clears restored strike; old failure adds one | Repaired in HARN-002 review by ignoring receipts without a live pending run; pure/adapter and three Quint scenarios cover disposal |
| Superseded QA command replaces newer mode | Recording-Pi probe: pending `/qa` → `/plan` → complete old QA; status becomes QA red instead of remaining Plan | Confirmed lifecycle blocker, HARN-005; proof remains revoked, but mode permissions regress |
| Incomplete lifecycle proof | Model omitted tool effects, stale QA failures, direct exec results, and reload recovery | HARN-002 extends lifecycle and adds the gate-evidence model; arbitrary effects and full lifecycle coverage remain HARN-003/005 |
| Distribution gate masks failure | Previous BOOT-005 QA: actual `tsc --noEmit` exit 1, generated `init.sh` exit 0 because an AND-list failure was followed by successful Quint check | Repaired: separate fail-fast stages; real Bash regressions cover each failed stage plus success for all three generated gates, without external toolchains |

These are bounded audit findings, not an exhaustive penetration test. In
particular, a regex guard is not an OS sandbox, and a shell script reported green
is not evidence that every command inside it ran successfully.

## Hardening record (not bootstrap prerequisites)

### HARN-001 — Per-feature approval authorization

**Status:** scoped acceptance reviewed in a separate review phase; no backlog flag changed.
Review found and repaired the nested `passes` contract bypass before completion.
This is not end-to-end release sign-off: HARN-003..005 remain open.

Acceptance:
- Every false→true transition requires green QA for that exact feature ID.
- A count-neutral swap cannot evade approval; a multi-feature approval is denied.
- Missing QA feature IDs, duplicate IDs, malformed lists, and contract rewrites
  fail closed; Plan cannot mutate the backlog, including clearing a pass.
- Pure regressions and the adapter event path prove those rules.
- Quint includes two representative feature IDs, selected-feature scoping, a
  scenario for the second feature, and the existing safety/teeth checks.

### HARN-002 — Trustworthy gate evidence and strike accounting

**Status:** scoped acceptance reviewed; no backlog flag changed. Pure/recording
regressions and real Pi SDK tests pass for bound hosts and reloads that omit
session-start notifications. Review found and repaired late abandoned completions
changing restored strikes: only a still-pending run can complete. Unknown receipts
are ignored, including after branch/session disposal. Uninitialized owners withhold
state; real contexts restore branch-local strikes. Two models cover evidence
invalidation, receipt identity, overlap, disposal and reload.

Scope boundary: this accounts recognized gates and observed file-tool mutations;
it does not close arbitrary shell/custom-tool escapes or exact edit prediction.
Those release blockers remain HARN-003/004 rather than being declared solved here.

Acceptance:
- Reproduce green QA → later failed/cancelled gate → attempted approval; deny it.
- Invalidate evidence on relevant intervening mutations, feature changes, and
  session/reload changes; document exactly what a green result covers.
- Route gate outcomes from tools, slash commands, and self-verification through
  one explicit accounting path; count each execution once, not zero or twice.
- Killed/aborted executions cannot grant approval or queue a reload.
- Two consecutive gate failures halt mutations; only genuine operator input can
  recover. Test success reset, halted-state absorption, and direct command gates.
- Extend lifecycle model and scenario tests for these actual event sequences.
- Prove results through real Pi as well as the hand-written recording adapter.

### HARN-003 — Explicit mutation and shell boundaries (deferred)

Acceptance:
- Define a written threat model: which Pi tool channels are mediated and which
  external/OS writes are out of scope. Never describe this as a sandbox.
- Reproduce Bash/PowerShell/interpreter escapes, custom mutating tools, and
  mutation attempts after two strikes; reject or require explicit operator
  approval before effects. Unknown effectful channels must not silently pass.
- Plan allows only its plan file; QA allows only its authorized backlog change.
  Specify the trusted verification-command exception and its write scope.
- Block nested protected files, outside-repo paths, Windows aliases/separators,
  and symlink escapes without breaking valid project paths.
- Preserve practical read-only exploration and deterministic gate execution.
- Tests exercise the real Pi event/tool schema, not merely proposed input shapes;
  extend the model for the mediated mutation boundary.

### HARN-004 — Exact file-mutation contracts (deferred)

Acceptance:
- Parse the full backlog shape; only existing top-level boolean pass values may
  change. Nested fields, duplicate/ambiguous keys, IDs, ordering, descriptions,
  and steps remain immutable. Preserve the existing strict textual restriction
  unless an explicit operator-approved contract change is required.
- Predicted write/edit results match the installed Pi tool's real behavior,
  including independent replacements, ambiguous matches, malformed input, and
  failures. Unknown formats fail closed rather than becoming unguarded edits.
- Content checks inspect the effective new content so edits cannot assemble
  forbidden usage across old/new text boundaries.
- Hand-written filesystem/recording fixtures and direct guard tests cover each
  counterexample; no mocking-library dependency is introduced.

### HARN-005 — Pi lifecycle and self-hosting release check (deferred)

Acceptance:
- Load the source extensions into the supported Pi version; verify statuses,
  command registration, denied tool effects, valid approval, halt/recovery, and
  reload after green verification without making provider/LLM requests.
- Confirm the supported edit schema and all event ordering assumptions against
  that installed version. A recording fake must match, not define, the API.
- Superseded asynchronous command completions cannot replace a newer mode or
  restore stale active tools/prompts (confirmed pending QA → Plan → old QA race).
- Local subtree instructions arrive early enough to constrain the first mutation;
  resets do not leave stale mode/evidence/context state. Recovery paths are tested.
- `/ratchet` can implement a harness-local rule without accidentally remaining
  trapped in QA/Plan mode; reload cannot silently escape a halt or reuse QA green.
- Close all confirmed release-blocking findings above. Run `bash ./init.sh` and
  independent adversarial review; use deep Quint proof at release if available,
  otherwise explicitly record its absence rather than claim exhaustive proof.
- Run one small real self-hosted change through plan → implementation → QA with
  concrete evidence and no manual guard bypasses. Append the handoff.

## Completed bootstrap and future work

BOOT-001…007 passed their own QA before the post-bootstrap scope reduction.
The TypeScript installer retains clean/repeat installs, conflict preservation,
symlink refusal, shell syntax and executable fail-fast regressions. Retired stack
arguments are rejected before target creation. Context symmetry and TODO ratchets
remain available; no replacement bootstrap round or downstream certification is
required to use them.

For any future hardened enforcement release, resolve and review the deferred
findings above. Until explicitly requested, they remain a separate work stream,
not another prerequisite for using this harness.
