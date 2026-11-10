# Overlay: Rust + Cargo Workspace

Maps `core/AGENTS.base.md` onto a Cargo workspace. Merge the Golden Commands below into the target repo's `AGENTS.md`.

## Golden Commands
- **Fast Check:** `CARGO_TARGET_DIR=target/agent-$AGENT_ID cargo clippy --workspace --all-targets -- -D warnings && CARGO_TARGET_DIR=target/agent-$AGENT_ID cargo test --workspace`
- **Scoped Module Test:** `CARGO_TARGET_DIR=target/agent-$AGENT_ID cargo test -p <crate> <context>::`
- **Architecture Sensor:** crate boundaries + `cargo deny check bans` + a workspace `tests/architecture.rs` that scans `use` paths.

## Translation Matrix
| Universal Concept | Rust Idiom |
| :--- | :--- |
| Sum / state types | `enum CheckState { Pending { .. }, Captured { .. } }` |
| Branded primitives | Tuple newtypes: `pub struct CheckId(String);` with a `TryFrom<&str>` parse at the edge |
| Exhaustive match | `match state { .. }` with no `_ =>` catch-all |
| Errors as values | `Result<T, DomainError>` where `DomainError` is an enum; `panic!`/`unwrap()` only for bugs |
| Ports | `pub trait CheckStore` in `ports.rs`; `InMemoryCheckStore` under `#[cfg(test)]`; `PostgresCheckStore` in the adapter crate |
| Contract tests | A `check_store_contract!(make_store)` macro (or generic fn) invoked by both in-memory and Postgres test modules |
| Deterministic time | `trait Clock { fn now(&self) -> OffsetDateTime; }` injected; tests use `TestClock` |

## Crate Boundaries (the compiler is the architecture sensor)
- One crate per bounded context's domain (`<context>-domain`): depends only on `std` and the shared `model` crate. No `sqlx`, `axum`, `serde_json`, `reqwest` (`cargo deny` `bans` enforces).
- Adapter crates (`<context>-http`, `<context>-postgres`) depend on the domain crate, never the reverse.
- Keep domain internals `pub(crate)`; publish only the `<Context>Service` API from `lib.rs`.
- Never add `mockall`; write `InMemory*` fakes.

## Parallel Agent Isolation
`CARGO_TARGET_DIR=target/agent-$AGENT_ID` gives every agent its own build cache and test binaries.
