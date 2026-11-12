# Guardrails for Code, Architecture, and Formal Verification

Read `ARCHITECTURE.md` for the bounded-context map and `spec/README.md` for the Quint formal models before changing structure. Where this file conflicts with default LLM habits, **this file wins**. Where the surrounding codebase already does something consistently, match its symmetry.

## Golden Commands (Configured per Stack Overlay)
- **Verify Baseline & Environment:** `bash ./init.sh`
- **Fast Check (Build + Unit + Contract + ArchitectureTest):** `<STACK_CHECK_FAST_CMD>`
- **Scoped Module Test:** `<STACK_SCOPED_TEST_CMD>`
- **Quint Shallow Check (Fast Simulation):** `bash ./spec/scripts/check.sh`
- **Quint Full Proof (Pre-Release Model Check):** `bash ./spec/scripts/prove.sh`
- **Parallel Agent Isolation:** Concurrent agent runs MUST isolate test output directories (`AGENT_ID` and a per-agent test output path) so parallel shifts never clobber test reports.

## Before You Finish Any Change
1. The build, unit/contract tests, and `ArchitectureTest` pass. **Never weaken `ArchitectureTest` or `feature_list.json` to make a change fit. Change the design.**
2. Zero dead code, unused parameters, stale comments, commented-out code, or orphaned files left behind.
3. New behaviour has a deterministic test at the lowest layer that can prove it.
4. Documentation (`ARCHITECTURE.md`, `README.md`) and formal specs (`spec/*.qnt` if state/ordering changed) are updated in the same change.
5. Leave every touched file tidier than you found it, strictly within the active task's scope.

## 1. Structure & Hexagonal Bounded Contexts
- **Monorepo Unidirectional Flow:** `apps/` (clients) and `services/` (deployable backends) may depend on `packages/` (shared libraries). A package NEVER depends on a service or app. A new package requires **two real consumers today**; one consumer means it belongs inside that consumer.
- **Vertical Bounded Contexts (Never Technical Layers):** Organize each service vertically by domain context, never by horizontal layer (`controllers/`, `services/`, `repositories/`). Every context follows the exact same symmetrical shape:
  <context>/
    <Aggregate>.<ext>          # Immutable data, value types, and sealed/sum types
    <Aggregate>Rules.<ext>     # Pure domain decisions, zero I/O, zero clock/randomness
    <Context>Ports.<ext>       # Outbound port interfaces named for domain need (not tech)
    <Context>Service.<ext>     # Published API interface + use-case orchestration
    <Context>Vertical.<ext>    # Context composition root (plain constructor wiring)
    http/                      # Inbound HTTP adapter (translates wire <-> domain types)
    postgres/                  # Outbound storage adapter (translates SQL <-> domain types)
- **Context Isolation:** Context A touches Context B ONLY through B's published API or by declaring an outbound port in A's own vocabulary that the service composition root binds to B.
- **Pure Constructor DI:** Inject all collaborators, clocks, randomness, config, and I/O via constructors or plain functions. Zero DI frameworks, reflection, service locators, or global singletons.
- **Hexagonal Domain Purity:** Domain files (`<Aggregate>`, `*Rules`, `*Ports`, `*Service`) import ONLY the standard library and shared `packages/model`. Zero web frameworks, JSON mappers, SQL drivers, or vendor SDKs in domain code (`ArchitectureTest` enforces this mechanically).

## 2. Types, Data, and Behaviour
- **Make Invalid States Unrepresentable:** Use sealed interfaces / discriminated unions with one variant per state holding only fields valid in that state. No boolean flag + nullable field pairs.
- **Parse, Don't Validate:** Convert raw wire/storage input into domain types once at the adapter edge. Wrap primitives with domain meaning (`CheckId`, `Money`) so same-type parameters cannot be swapped.
- **Exhaustive Matching & Errors as Values:** Match over sum types with no catch-all `else`/`default` that hides future variants. No non-null assertions (`!!` / `!`), unchecked casts, or catch-all exception swallowing. Expected domain failures are returned as typed values/results; exceptions are for bugs and infrastructure faults.
- **Separate Effects from Decisions:** `*Rules` are 100% pure (`value in -> value out`). `*Service` performs the thin effectful shell: read from port, call pure rule, write to port.
- **Right-Sized & Anti-Bloat:** No interfaces with a single implementation unless a port boundary sits behind it. No `*Impl`, `*Manager`, `*Helper`, `*Factory`, or `utils`/`common` buckets. Three similar lines beat a premature abstraction; a fourth copy earns a named function. Functions fit on a screen (~20 lines is a smell, ~40 is a stop); split files past ~300 lines along a real domain seam.
- **Durable Workflows & Quint Formal Verification:** Processes spanning time, crashes, or remote calls (payments, webhooks, multi-step state machines) require persisted state and idempotent command handling. Model concurrency, ordering, retries, and state machines in `spec/*.qnt` and keep model and code synchronized.

## 3. Testing Pyramid & Zero-Mocking Discipline
- **Unit Tests (Most):** Test pure `*Rules` and `*Service` use cases against hand-written in-memory fakes (`InMemory<Context>Store`). **Never use a mocking library.** Keep fakes in test sources beside port tests.
- **Contract Tests:** Every outbound port has a `<Port>Contract` test suite executed against BOTH the `InMemory*` fake and the real adapter (`Postgres*StoreTest`). Add a port -> add its contract.
- **Deterministic Time:** Always inject `TestClock`; never `sleep` or read real system time (any unavoidable real-clock crypto fixture must isolate a single documented `TEST_NOW` constant).
- **Bug Fix Protocol:** Every bug fix or Quint counterexample starts with a failing deterministic test at the lowest layer that reproduces it.

## 4. Anti-Entropy Discipline
- **The Ratchet Only Tightens:** When an agent repeats a mistake, encode the cheapest permanent mechanical check (pure guard + test, linter rule, `ArchitectureTest`, Quint invariant, or skill negative example). Never loosen a sensor to land a change.
- **Two-Strike Cap:** After two consecutive deterministic-gate failures, stop mutating files, summarise the evidence and hypotheses, and ask the human for steering.
- **Delete Before You Add:** Prefer removing dead paths, duplicate concepts, and speculative options over adding new ones. Every diff is reviewed adversarially for simplification before it is marked passing.
- **Immutable Backlog:** `feature_list.json` descriptions and steps are a contract. Only `/qa`, after a green gate, flips `"passes": false` to `true`.
