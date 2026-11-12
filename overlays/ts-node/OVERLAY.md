# Overlay: TypeScript (strict) + Node

Maps `core/AGENTS.base.md` onto TypeScript. Merge the Golden Commands below into the target repo's `AGENTS.md`.

## Golden Commands
- **Fast Check:** `npx tsc --noEmit && npx vitest run --outputFile=.tmp/test-$AGENT_ID.json && node ./scripts/lint-architecture.mjs`
- **Scoped Module Test:** `npx vitest run services/<svc>/<context>`
- **Architecture Sensor:** `node ./scripts/lint-architecture.mjs [dir ...]` (copy `lint-architecture.mjs` to `scripts/`).

## Translation Matrix
| Universal Concept | TypeScript Idiom |
| :--- | :--- |
| Sum / state types | Discriminated unions: `type State = { kind: "A"; a: X } \| { kind: "B"; b: Y }` |
| Branded primitives | `type CheckId = string & { readonly __brand: unique symbol }` plus a single `parseCheckId(raw): CheckId \| ParseError` |
| Exhaustive match | `switch (state.kind)` with `default: return assertNever(state)` |
| Errors as values | `type CaptureResult = { kind: "captured"; .. } \| { kind: "rejected"; reason: .. }` |
| Ports | `interface CheckStore` in `<Context>Ports.ts`; `InMemoryCheckStore` in test sources; `PostgresCheckStore` in `postgres/` |
| Contract tests | `export function checkStoreContract(make: () => CheckStore)` run by both the in-memory and Postgres suites |
| Deterministic time | `type Clock = { now(): Date }` injected; tests use a `TestClock` |

Compiler flags: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`. No `!` non-null assertions, no `as` casts outside the parse edge, no `any`.

## Architecture Linter (`lint-architecture.mjs`)
Scans imports and reports, each with a `REMEDIATION:` line:
- `monorepo-direction` — `packages/` importing `apps/` or `services/`.
- `hexagonal-direction` — domain (`*Rules`, `*Ports`, `*Service`, `rules/`) importing an adapter (`http/`, `postgres/`, `adapters/`, `extensions/`, `cli/`).
- `domain-purity` — domain importing I/O modules or vendor packages (only std lib and `*/model` are allowed).
- `deterministic-domain` — domain reading `Date.now()`, `new Date()`, or `Math.random()`.

Tests (`*.test.*`, `*Test.*`, `*Contract.*`) and `*Vertical` composition roots are exempt from the domain rules.

## Parallel Agent Isolation
Write test reports to `.tmp/test-$AGENT_ID.json` and run agents in separate worktrees; never share `coverage/` between agents.
