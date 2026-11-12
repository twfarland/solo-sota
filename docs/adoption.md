# Adopt Solo-SOTA in an existing Pi project

This is an additive TypeScript/Node migration, not a fresh-project generator or a
universal configuration merger. Keep a checkpoint/backup of your project first.
The command does not require Git, initialize it, or change its history/config/index.

## Preview, then apply

From the harness checkout:

```bash
npm run adopt-project -- --target /path/to/existing-project
npm run adopt-project -- --target /path/to/existing-project --apply
```

From anywhere, use `node /path/to/solo-sota/bin/adopt-project.mjs` with the same
arguments. Relative targets resolve from the invoking directory; quote spaces.
The destination must already exist. There is no force flag.

Without `--apply`, the command is read-only: it lists CREATE/UPDATE actions,
REVIEW items and blocking CONFLICTs. It does not write plans, backups or settings,
and does not execute project commands. Settings contents are not dumped to stdout.
A conflict exits nonzero. With `--apply`, any detected conflict still prevents
**all** writes. Applying successfully means files were integrated, not that the
project is verified or every extension is compatible.

## What merges, what stays

- **Context instructions:** append the full harness guidance in a marked block,
  retaining the original text. Use the existing effective root context file:
  `AGENTS.override.md`, then `AGENTS.md`/`AGENTS.MD`, then `CLAUDE.md`/`CLAUDE.MD`.
  If none exists, create `AGENTS.md`. Do not shadow an existing override/CLAUDE
  file with a new AGENTS file. Existing unmodified harness guidance is a no-op.
- **`.pi/settings.json`:** retain unrelated fields, provider/model/tool settings,
  packages and existing resource entries; append missing shared-checkout extension
  and skill paths. Equivalent explicit relative paths and `+path` inclusions are
  recognized. Formatting can change; the original file is backed up.
- **Missing guidance/assets:** install the same core, TypeScript overlay,
  architecture sensor and Quint scripts as the guidance-only installer. The MIT
  notice goes to `core/SOLO-SOTA-LICENSE`; your application's license is not replaced.
- **Existing `init.sh`, `ARCHITECTURE.md`, `spec/README.md`:** preserve them,
  report differing project-owned files for manual integration. In particular,
  an existing gate is neither replaced nor certified. If `init.sh` is missing,
  install the standard TypeScript/Vitest gate; configure its prerequisites.
- **`.gitignore`:** append local backup/settings ignore rules. Already tracked
  files remain tracked; review your team's settings/versioning policy.
- **Everything else:** no application source, tests, dependencies, package/lock
  files, tsconfig, project README, backlog, MCP definitions, system prompts,
  existing extension files, or Git metadata is rewritten. No provider request,
  dependency installation, saved trust decision, staging or commit is made.

Original versions of changed files are saved under `.solo-sota-backup/`, using
relative paths (for example `.solo-sota-backup/.pi/settings.json`). These may
contain sensitive settings: keep them local and review before committing.
Existing backups with different content are never overwritten. New files need
no original-file backup. A second identical adoption writes zero files.

## Conflicts that need a human

The command refuses to guess about:

- Differing harness-owned assets, including an existing architecture sensor or
  Quint gate. Never replace a stronger sensor just to make adoption succeed.
- Invalid/non-object settings JSON or non-string resource arrays. Only strict
  JSON is supported; comments/trailing commas need manual merging first.
- Non-builtin resource exclusions (`!pattern` or `-path`). Review them rather
  than silently overriding an intentional disable rule.
- Explicit extension-file references to another harness checkout. Choose which
  copy to load instead of registering two owners.
- Edited, duplicated or incomplete managed guidance markers, or occupied backups
  whose content differs from the file about to change.
- Symlinked paths, hard-linked candidate files, non-directory parents, or a target
  inside `.git` metadata.

Resolve unambiguous configuration issues and preview again. Divergent custom
sensors/gates may require **manual completion** of migration instead of an
automated asset install. There is no automatic semantic merge or force/skip
option for those files.

Existing user/global packages, resource directories, extensions, skills, tools,
MCP servers and system prompts are preserved. They may still conflict with
Solo-SOTA. The audit cannot prove what dynamically loaded code or inherited
configuration will do. It is not extension isolation or an operating-system sandbox.

## Finish integration before using the workflow

1. Reconcile the existing instructions with the appended guardrails. Update the
   architecture map and formal-model README for your real application.
2. Preserve the project's test runner and integrate compiler, real tests,
   architecture and appropriate Quint gates into `./init.sh`. Install any missing
   dependencies intentionally. The default gate expects TypeScript and Vitest;
   existing gates may use a different runner. Empty specs are not formal evidence.
3. Review/establish the application's own `feature_list.json` contract. Existing
   acceptance criteria and pass flags are never migrated or reinterpreted by this
   tool. Confirm its shape is compatible before `/shift` and `/qa`.
4. Run `bash ./init.sh` and inspect the checks it actually executes. Adoption never
   turns a failing/missing verification step into a green result.
5. Start ordinary `pi` in the project and approve its trust prompt. If already
   running, `/reload` can load the settings/resources; restart if CLI flags such
   as `--no-extensions` disabled them. No new conversation is required just to
   reload. Confirm the harness status and `/init-harness`, `/plan`, `/shift`, `/qa`.
6. Review the diff/backups and make your own commit when satisfied.

The machine-local Pi settings reference this checkout. Keep it available and
configure new paths on another machine. Runtime updates load after reload;
installed guidance/gates remain snapshots requiring deliberate merges.

Preflight and a final write-set recheck prevent predictable conflicts, **not**
concurrent filesystem races or partial infrastructure failures. Run one adopter
at a time. There is no transaction or automatic rollback: inspect partial output,
restore modified files from backups if needed, and review newly created files
before removing anything manually.
