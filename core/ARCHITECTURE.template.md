# ARCHITECTURE.md — <Project Name>

> Template from `pi-sota-harness/core`. Replace every `<placeholder>`; delete sections that do not apply. Keep this file the single map of bounded contexts.

## 1. Purpose
<One paragraph: what the system does and for whom.>

## 2. Deployables & Packages
| Path | Kind | Depends on |
| :--- | :--- | :--- |
| `apps/<client>` | client app | `packages/model` |
| `services/<svc>` | deployable backend | `packages/model` |
| `packages/model` | shared value types (≥2 real consumers) | — |

## 3. Bounded Contexts
For each context inside a service:

### `<context>` (`services/<svc>/<context>/`)
- **Aggregate:** `<Aggregate>` — <invariant it protects>.
- **Rules:** `<Aggregate>Rules` — <pure decisions>.
- **Ports (outbound):** `<Port>` — <domain need>; adapters: `InMemory<Port>` (tests), `Postgres<Port>`; contract: `<Port>Contract`.
- **Published API:** `<Context>Service` — <use cases>.
- **Inbound adapters:** `http/` — <routes>.
- **Talks to:** `<other context>` via `<OtherContext>Service` / port `<Port>`.

## 4. State Machines & Formal Models
| Workflow | Code | Quint model | Key invariants |
| :--- | :--- | :--- | :--- |
| <workflow> | `<Aggregate>Rules` | `spec/<context>.qnt` | `inv_<name>`, teeth `inv_teeth_<name>` |

## 5. Cross-Cutting Decisions
- **Time:** injected `Clock`; tests use `TestClock`.
- **Durability:** <outbox / idempotency keys / retries>.
- **Errors:** domain failures are typed values; exceptions are bugs and infrastructure faults.

## 6. Golden Commands
See the stack overlay merged into `AGENTS.md`.
