# Mechanical checks and their boundaries

These scripts run in this checkout's full gate. They do not prove arbitrary
shell effects or form an OS sandbox. Target gates get the architecture/Quint
assets; the TODO and symmetry CLIs currently remain checkout-local.

## TODO ownership/reason ratchet

New comment markers need a nonblank owner and reason:

```ts
// TODO(team-platform): handle retries after reconnect
```

The pure rule checks projected write/edit content. For Git working-tree checks:

```bash
node ./scripts/check-todo-diff.mjs /path/to/repo
# This checkout:
npm run check:todos
```

The Git adapter compares final working-tree content for tracked/changed and
untracked files to HEAD, not a separate staged-index snapshot. An unborn repo
has no baseline and treats all files as new. Unchanged malformed markers in the
same file are grandfathered; extra copies and ownership/reason regressions fail.

The lightweight lexer recognizes leading markers in common `//`, `#`, `--`,
block and HTML comments, skipping ordinary quoted strings. It is not an AST
parser; template interpolation and language-specific literals are not fully
parsed. Binary/NUL-containing files and links are skipped; text is UTF-8.
Exit codes: **0** clean, **1** rejected, **2** Git/filesystem/argument error.
The adapter is read-only and is not a general commit hook.

## Bounded-context contract symmetry

```bash
node ./scripts/check-context-symmetry.mjs /path/to/repo
# This checkout:
npm run check:symmetry
```

A direct `<Name>Ports.ts` file (also `.mts`, `.cts`, `.tsx`) plus production
source under `postgres/`, `adapters/` or `outbound/` requires a local contract
suite. HTTP alone is inbound. Diagnostics identify the Ports file, adapter and
suggested sibling, for example `billing/checks/CheckContract.test.ts`.

Supported suite shapes include `*Contract.test.ts`, `*Contract.spec.ts`,
`*ContractTest.ts`, and reusable `*Contract.ts`, with supported TypeScript variants.
They may sit beside Ports or in that context's test/recognized adapter subtree.
Another context's suite cannot satisfy the requirement. Filename presence is
**not proof** of per-port coverage or fake/real adapter contract execution.

The walker skips links and `.git`, `node_modules`, `build`, `dist`, `target`,
`coverage`, `.tmp` subtrees. Exit codes: **0** clean, **1** missing contracts,
**2** invalid arguments/filesystem errors. No files are written.

## Architecture and formal checks

The TypeScript sensor checks monorepo import direction, domain purity, adapter
boundaries and direct clock/random usage. See the [overlay](../overlays/ts-node/OVERLAY.md).
Never weaken it to make an implementation fit.

Quint shallow checks typecheck, run scenarios, simulate non-teeth safety
invariants and require teeth witnesses. Deep proof is separate and bounded;
see [the model guide](../spec/README.md). Empty project specs are not evidence.

Unit/SDK/CLI tests show what their assertions cover, not comparative coding-agent
fitness. Independent outcome measurement belongs in the proposed [outer evaluator](evaluation.md).
