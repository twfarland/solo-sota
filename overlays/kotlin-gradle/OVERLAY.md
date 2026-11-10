# Overlay: Kotlin (JDK 25) + Gradle

Maps `core/AGENTS.base.md` onto Kotlin/Gradle. Merge the Golden Commands below into the target repo's `AGENTS.md`.

## Golden Commands
- **Fast Check:** `./gradlew build --init-script overlays/kotlin-gradle/init-isolated-tests.gradle.kts -PagentId=$AGENT_ID`
- **Scoped Module Test:** `./gradlew :services:<svc>:test --tests '<context>.*' --init-script overlays/kotlin-gradle/init-isolated-tests.gradle.kts -PagentId=$AGENT_ID`
- **Architecture Sensor:** `ArchitectureTest` (copy `ArchitectureTest.kt.template` into each service's test sources and set `ROOT_PACKAGE`).

## Translation Matrix
| Universal Concept | Kotlin Idiom |
| :--- | :--- |
| Sum / state types | `sealed interface` + `data class` / `data object` variants |
| Branded primitives | `@JvmInline value class CheckId(val value: String)` |
| Exhaustive match | `when (state)` expression with **no** `else ->` branch |
| Errors as values | `sealed interface CaptureResult { data class Captured(..); data class Rejected(..) }` (no `Result<T>` with `Throwable` for domain failures) |
| Ports | `interface CheckStore` in `<Context>Ports.kt`; `InMemoryCheckStore` in test sources; `PostgresCheckStore` in `postgres/` |
| Contract tests | `abstract class CheckStoreContract { abstract fun store(): CheckStore }` extended by `InMemoryCheckStoreTest` and `PostgresCheckStoreTest` |
| Deterministic time | `java.time.Clock` injected via constructor; tests use `Clock.fixed(TEST_NOW, ZoneOffset.UTC)` or a mutable `TestClock` |

## Parallel Agent Isolation
`init-isolated-tests.gradle.kts` redirects binary results, JUnit XML, and HTML reports to `build/test-results-<agentId>/` and `build/reports/tests-<agentId>/` when `-PagentId=<id>` (or `PI_AGENT_ID`) is set, so concurrent shifts in separate worktrees never clobber each other's reports. Without an id it is a no-op.

## Banned in Domain Code (`ArchitectureTest` enforces)
`org.springframework`, `io.ktor`, `com.fasterxml.jackson`, `kotlinx.serialization`, `java.sql`, `org.jooq`, `io.mockk`, `org.mockito`, `java.time.Instant.now()`, `System.currentTimeMillis()`, `kotlin.random.Random` default instance.
