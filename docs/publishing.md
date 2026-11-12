# Public GitHub release checklist

Canonical repository: [twfarland/solo-sota](https://github.com/twfarland/solo-sota).
The source is MIT-licensed; the private npm package setting is intentional.
Setup commands do not commit, push, publish npm or establish hosted CI results.
Follow this checklist before publishing a revision.

## Maintainer decisions

- Verify the intended origin is `https://github.com/twfarland/solo-sota.git` and
  establish support expectations. Do not invent a maintainer contact address.
- Preserve the [MIT notice](../LICENSE), matching package/lock metadata and copied
  notices at `core/SOLO-SOTA-LICENSE`. Review dependency/asset license obligations;
  the harness license does not replace an application's own license.
- Enable GitHub private vulnerability reporting or establish a real private
  contact route; update [SECURITY.md](../SECURITY.md). Configure branch protections
  and require the verification checks as appropriate for the chosen repository.

## Content and privacy review

- Inspect the complete tracked/untracked release diff and full Git history with
  a trusted secret scanner. A filename/regex pass is not a comprehensive audit.
- Run `npm audit` and assess dependency advisories. SDK 1.5.2 resolves the previous
  findings; see [SECURITY.md](../SECURITY.md#dependency-audit-status). Zero findings
  are point-in-time, not a security guarantee. Validate SDK/runtime upgrades and
  do not force-upgrade blindly.
- Review credentials, private URLs, registry configuration, local home paths,
  transcripts, original migration backups, screenshots and model traces. If a
  credential ever entered history, rotate it and coordinate any history repair;
  deleting the working file is insufficient.
- Keep local `.env*`, `.pi` settings/MCP/auth, sessions, migration backups,
  dependencies and generated output out of the release. Ignore rules do not
  remove already tracked files or prove absence of secrets.
- Preserve the immutable bootstrap contracts and append-only ledger. They contain
  historical retired-stack scope, not current support claims. If history needs
  sensitive-data redaction, obtain an explicit exception rather than silently
  rewriting the ledger or acceptance history.

## Verification

```bash
npm ci
bash ./init.sh
npm audit --audit-level=low
git diff --check
```

Review all untracked additions and intended deletions, not only `git diff --stat`.
Test a clean checkout/copy, new-project creation, adoption preview/apply and
source loading without real provider requests. Review the CI workflow: pinned
actions, read-only permissions, no secrets, no `pull_request_target`, full gate
on Node 24 / Ubuntu and Windows plus an advisory gate. Confirm actual hosted results after push;
a local green run is not a hosted matrix result.

Deep Quint proof is separate, needs Java/downloads and is not implied by the
shallow gate. Record whether it ran, its bounds and limitations. No existing test,
guard, linter or invariant may be weakened for release readiness.

## Describe the release honestly

- TypeScript/Node only; pinned/tested Pi SDK integration 1.5.2.
- Experimental; known HARN-003…005 findings remain documented.
- Not an OS sandbox, universal migration engine or production security approval.
- Installed guidance/gates are snapshots; source extensions follow the shared
  checkout after reload. Machine-local paths need setup on another machine.
- No comparative benchmark results. The [outer evaluator](evaluation.md) is a
  proposal, not a shipped command or demonstrated state-of-the-art result.
- Keep [CHANGELOG.md](../CHANGELOG.md) consistent with what actually ships.

After review and explicit maintainer approval, commit the intended source state,
verify the canonical GitHub remote and push. Verify the hosted checks and
public documentation before tagging a release. Those network/publication actions
are deliberate maintainer steps, not side effects of setup or verification.
