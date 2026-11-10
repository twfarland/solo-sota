---
name: bounded-context-design
description: Design or restructure code as hexagonal vertical slices (Aggregate, pure Rules, Ports, Service, Vertical, http/, postgres/) with Parse-Don't-Validate types and InMemory fake + Contract tests. Use when adding a feature, a context, a port, or an adapter.
---

# Bounded Context Design Skill

## Routing
- **USE** when creating a new context, adding a port/adapter, moving code between contexts, or when the path guard / `ArchitectureTest` / `lint-architecture` rejects a change.
- **DO NOT USE** for one-line fixes inside an existing, well-shaped file.

## Procedure
1. **Name the context and its aggregate** in domain language. Check `ARCHITECTURE.md`; if the concept already lives somewhere, extend that context instead of creating a new one.
2. **Types first** (`<Aggregate>.<ext>`): immutable data, one sum-type variant per state, branded primitives for every ID/amount. If a field is only valid in one state, it lives only in that variant.
3. **Rules** (`<Aggregate>Rules.<ext>`): pure `value in -> value out` decisions returning typed results (`Captured | Rejected`). No clock, randomness, or I/O; take `now` as a parameter.
4. **Ports** (`<Context>Ports.<ext>`): one interface per outbound domain need, named for the need (`CheckStore`, `PaymentGateway`), not the technology.
5. **Service** (`<Context>Service.<ext>`): thin effectful shell — read from port, call rule, write to port. This is the context's only published API.
6. **Vertical** (`<Context>Vertical.<ext>`): plain-constructor wiring of service + adapters. No DI container.
7. **Adapters** (`http/`, `postgres/`): parse wire/storage input into domain types once; translate back on the way out.
8. **Tests, lowest layer first:** `<Aggregate>RulesTest` (pure), `<Context>ServiceTest` with `InMemory<Port>` + `TestClock`, and a `<Port>Contract` suite run against both the fake and the real adapter.
9. **Update `ARCHITECTURE.md`** context entry in the same change.

## Negative Examples (never do this)
- `services/billing/controllers/`, `repositories/`, `utils/` → horizontal layers / buckets. Use `services/billing/checks/http/`.
- `CheckServiceImpl`, `PaymentManager`, `StringHelper` → name the role: `PostgresCheckStore`, `PaymentRules`.
- `data class Check(val status: String, val capturedAt: Instant?)` → boolean/nullable pair. Use `sealed interface Check { Pending; Captured(capturedAt) }`.
- `CheckRules` calling `Instant.now()` / `Date.now()` → inject a clock or pass `now`.
- Context A importing `b.postgres.PostgresBStore` → go through `BService` or a port in A's vocabulary.
- `mockk<CheckStore>()` / `vi.mock("./store")` → write `InMemoryCheckStore` and run `CheckStoreContract` against it.
