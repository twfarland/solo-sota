---
name: anti-entropy-review
description: Adversarially review a diff for simplification, dead code, stale docs, duplicated concepts, and weakened sensors before a feature is marked passing. Use during /qa and before every commit.
---

# Anti-Entropy Review Skill

## Routing
- **USE** in `/qa`, before committing, and after any shift that touched more than a handful of files.
- **DO NOT USE** as a substitute for the deterministic gate; run `bash ./init.sh` first.

## Procedure
1. **Collect the diff:** `git status` and `git diff` (plus `git diff --stat` for scope). Anything outside the active feature's scope is a finding.
2. **Sensors untouched:** confirm no test, `ArchitectureTest`, `lint-architecture`, guard rule, Quint invariant, or `feature_list.json` step was weakened, skipped, or deleted. Any such change fails QA outright.
3. **Delete pass** — for every added line ask "what breaks if this is removed?":
   - unused exports, parameters, branches, flags, and config options;
   - commented-out code, stale comments, TODOs without `TODO(owner): reason`;
   - files nothing imports; tests that assert nothing.
4. **Simplify pass:** single-implementation interfaces without a port boundary, premature abstractions (fewer than four copies), functions over ~40 lines, files over ~300 lines, catch-all `else`/`default`/`_` arms, non-null assertions, unchecked casts.
5. **Symmetry pass:** new code follows the same shape as its sibling contexts (file names, test layout, contract suites).
6. **Docs & models:** `ARCHITECTURE.md`, `README.md`, and `spec/*.qnt` reflect the change; `claude-progress.txt` has a handoff entry.
7. **Verdict:** list findings as `file:line — problem — fix`. QA passes only with zero blocking findings.

## Negative Examples (reject these)
- "Temporarily" skipping a failing test or adding `.skip` / `@Disabled`.
- Loosening a regex in `src/rules/guardrail-rules.ts` so a badly named file is accepted.
- Adding a `utils.ts` "just for now".
- Leaving an old and a new implementation side by side behind a flag nobody sets.
