# HARNESS_BOOTSTRAP_SPEC.md — Self-Improving Solo-SOTA Pi Harness with Quint Formal Gates

## Goal
Build a reusable, self-hosting Pi coding agent harness package (`pi-sota-harness`) that:
1. Operates within a solo operator's $200/month budget by combining flat-rate `/login` subscriptions (for `/shift` execution) with surgical, low-turn `/plan` and `/qa` passes and zero-LLM-cost `pi-vcc` compaction.
2. Enforces strict Vertical-Slice / Hexagonal Architecture, Parse-Don't-Validate types, Zero-Mocking Contract Testing (`InMemory*` fakes + `*Contract`), and Anti-Entropy discipline via a language-agnostic core (`core/`) and stack overlays (`overlays/`).
3. Integrates **Quint** (`@informalsystems/quint`) as a two-tier formal verification gate:
   - **Shallow Gate (`spec/scripts/check.sh`):** Fast `quint typecheck`, `quint test`, and bounded `quint run` simulator during development shifts.
   - **Deep Proof Gate (`spec/scripts/prove.sh`):** Exhaustive symbolic/explicit-state model checking (`quint verify`) and teeth-probe validation prior to production releases.
4. Bootstraps a `/ratchet` self-improvement command and `reload_harness` tool so Pi can modify its own extensions, skills, and linters based on session failures, verify them with `node --test`, and hot-reload itself via `ctx.reload()`.

---

## 1. Target Repository Structure

Create the following directory layout. All pure parsing, path-gating, and architectural lint logic MUST live in pure, side-effect-free modules (`src/rules/*.ts`) tested via `node --test`, keeping the Pi API adapter layer (`extensions/*.ts`) thin.

```text
pi-sota-harness/
├── package.json                           # Pi Package manifest (extensions, skills, prompts)
├── init.sh                                # Idempotent environment + test + Quint sanity gate
├── AGENTS.md                              # ~100-line Table of Contents map for self-hosting
├── ARCHITECTURE.md                        # Harness domain map & statechart invariants
├── feature_list.json                      # Immutable bootstrap & self-improvement backlog
├── claude-progress.txt                    # Shift-to-shift handoff ledger
├── core/
│   ├── AGENTS.base.md                     # Language-agnostic Core Engineering Guardrails
│   └── ARCHITECTURE.template.md           # Template for target repositories
├── overlays/
│   ├── kotlin-gradle/
│   │   ├── OVERLAY.md                     # Kotlin (JDK 25) specifics + parallel Gradle init
│   │   ├── init-isolated-tests.gradle.kts # Prevents parallel agents clobbering build/test-results
│   │   └── ArchitectureTest.kt.template   # Hexagonal + Bounded Context enforcement test
│   ├── ts-node/
│   │   ├── OVERLAY.md                     # TypeScript strict discriminated unions + Vitest
│   │   └── lint-architecture.mjs          # Self-remediating AST/import boundary linter
│   └── rust-cargo/
│       └── OVERLAY.md                     # Rust workspace & crate boundary specifics
├── spec/
│   ├── README.md                          # Guide to the 6-step Quint Sync-and-Fix loop
│   ├── harness_lifecycle.md               # Plain-text model of the harness state machine
│   ├── harness_lifecycle.qnt              # Executable Quint spec of the harness itself
│   └── scripts/
│       ├── check.sh                       # Fast gate: quint typecheck + test + shallow run
│       └── prove.sh                       # Release gate: quint verify (Apalache/TLC) + teeth
├── src/
│   └── rules/
│       ├── guardrail-rules.ts             # Pure functions: banned filenames, mock detection, diff checks
│       └── guardrail-rules.test.ts        # Deterministic unit tests (zero mocks)
├── extensions/
│   ├── solo-sota-harness.ts               # Core hooks: LocalContextMiddleware, guards, 2-strike cap
│   ├── plan-quint-qa-modes.ts             # Statechart: /init-harness, /plan, /shift, /quint-*, /qa
│   └── self-ratchet.ts                    # Self-improvement: /ratchet command + reload_harness tool
└── skills/
    ├── bounded-context-design/
    │   └── SKILL.md                       # Hexagonal vertical slices, pure Rules, Contract + Fake tests
    ├── quint-formal-modeling/
    │   └── SKILL.md                       # 6-step Quint temporal modeling & ITF trace -> test loop
    └── anti-entropy-review/
        └── SKILL.md                       # Adversarial simplification & dead-code elimination
```

---

## 2. Language-Agnostic Core Guardrails (`core/AGENTS.base.md`)

Write `core/AGENTS.base.md` by distilling the universal architectural laws below. Keep this file under 115 lines so it acts as a high-signal constitution when copied or merged into any project's root `AGENTS.md`.

```markdown
# Guardrails for Code, Architecture, and Formal Verification

Read `ARCHITECTURE.md` for the bounded-context map and `spec/README.md` for the Quint formal models before changing structure. Where this file conflicts with default LLM habits, **this file wins**. Where the surrounding codebase already does something consistently, match its symmetry.

## Golden Commands (Configured per Stack Overlay)
- **Verify Baseline & Environment:** `bash ./init.sh`
- **Fast Check (Build + Unit + Contract + ArchitectureTest):** `<STACK_CHECK_FAST_CMD>`
- **Scoped Module Test:** `<STACK_SCOPED_TEST_CMD>`
- **Quint Shallow Check (Fast Simulation):** `bash ./spec/scripts/check.sh`
- **Quint Full Proof (Pre-Release Model Check):** `bash ./spec/scripts/prove.sh`
- **Parallel Agent Isolation:** Concurrent agent runs MUST isolate test output directories (`AGENT_ID` / gradle init script / custom test output path) so parallel shifts never clobber test reports.

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
```

---

## 3. Stack Overlay Translation Matrix (`overlays/<stack>/OVERLAY.md`)

Each stack overlay maps the universal constructs in `core/AGENTS.base.md` to stack-idiomatic primitives and parallel-safe build flags:

| Universal Concept | `overlays/kotlin-gradle` (JDK 25) | `overlays/ts-node` (TypeScript Strict) | `overlays/rust-cargo` (Rust) |
| :--- | :--- | :--- | :--- |
| **Sum / State Types** | `sealed interface` + `data class` / `data object` | Discriminated unions (`type State = { kind: "A" } \| { kind: "B" }`) | `enum` variants with struct payloads |
| **Branded Primitives** | `@JvmInline value class CheckId(val value: String)` | Branded types (`type CheckId = string & { readonly __brand: unique symbol }`) | Tuple newtypes (`pub struct CheckId(String);`) |
| **Exhaustive Match** | `when (state)` expression with NO `else ->` branch | `switch (state.kind)` with `assertNever(state)` in `default` | `match state` with no `_ =>` catch-all |
| **Architecture Sensor** | JUnit `ArchitectureTest` scanning package imports & AST | `node ./scripts/lint-architecture.mjs` scanning AST/imports | Workspace crate visibility + `cargo-deny` / custom lint |
| **Parallel Test Isolation** | `./gradlew test --init-script init-isolated-tests.gradle.kts -PagentId=$AGENT_ID` | `VITEST_SEGMENTS` / `--outputFile=.tmp/test-$AGENT_ID.json` | `CARGO_TARGET_DIR=target/agent-$AGENT_ID` |

### Kotlin Parallel Agent Isolation Script (`overlays/kotlin-gradle/init-isolated-tests.gradle.kts`)
```kotlin
// Redirects test binary/XML/HTML outputs per agent worktree or session ID
// Usage: ./gradlew build --init-script overlays/kotlin-gradle/init-isolated-tests.gradle.kts -PagentId=shift1
val agentId = startParameter.projectProperties["agentId"] ?: System.getenv("PI_AGENT_ID") ?: "default"
if (agentId != "default") {
    allprojects {
        tasks.withType<AbstractTestTask>().configureEach {
            binaryResultsDirectory.set(layout.buildDirectory.dir("test-results-$agentId/$name/binary"))
            reports.html.outputLocation.set(layout.buildDirectory.dir("reports/tests-$agentId/$name"))
            reports.junitXml.outputLocation.set(layout.buildDirectory.dir("test-results-$agentId/$name"))
        }
    }
}
```

---

## 4. Quint Formal Verification Subsystem (`spec/` & `skills/quint-formal-modeling/`)

Because Quint (`@informalsystems/quint`) is computationally and token-intensive when running symbolic model checking via Apalache/Z3 or explicit-state checking via TLC (requiring Java 17+), the harness separates **Shallow Simulation** from **Deep Proof** and enforces a strict **6-Step Sync-and-Fix Loop**.

### 4.1 Shallow Gate Script (`spec/scripts/check.sh`)
Run during active development shifts when `spec/*.qnt` or state-machine rules (`*Rules.*`) are touched. Executes in seconds without heavy solver overhead:

```bash
#!/usr/bin/env bash
set -euo pipefail

SPEC_DIR="${1:-spec}"
mkdir -p "$SPEC_DIR/traces"

if ! command -v quint >/dev/null 2>&1; then
  echo "❌ [Quint Check] '@informalsystems/quint' not found. Install via: npm i -g @informalsystems/quint"
  exit 1
fi

shopt -s nullglob
QNT_FILES=("$SPEC_DIR"/*.qnt)
if [ ${#QNT_FILES[@]} -eq 0 ]; then
  echo "ℹ️ [Quint Check] No .qnt files found in $SPEC_DIR."
  exit 0
fi

for qnt in "${QNT_FILES[@]}"; do
  base=$(basename "$qnt" .qnt)
  echo "=== [Quint Shallow Gate] 1/3 Type & Effect Checking: $qnt ==="
  quint typecheck "$qnt"

  echo "=== [Quint Shallow Gate] 2/3 Deterministic Spec Tests: $qnt ==="
  quint test "$qnt"

  if grep -q "val inv_" "$qnt"; then
    inv=$(grep -o "val inv_[a-zA-Z0-9_]*" "$qnt" | head -n 1 | awk '{print $2}')
    echo "=== [Quint Shallow Gate] 3/3 Random Simulator (max-steps=20, samples=200, invariant=$inv) ==="
    quint run \
      --invariant="$inv" \
      --max-steps=20 \
      --max-samples=200 \
      --out-itf="$SPEC_DIR/traces/${base}_shallow_violation.itf.json" \
      "$qnt"
  fi
done

echo "✅ [Quint Shallow Gate] All specifications typechecked, tested, and simulated cleanly."
```

### 4.2 Deep Proof Gate Script (`spec/scripts/prove.sh`)
Run manually or via `/quint-prove` before major production releases. Performs exhaustive bounded model checking (`quint verify`) and runs **teeth probes** (`inv_teeth_*`, which are negated witness invariants that MUST fail to prove the model is not vacuously passing):

```bash
#!/usr/bin/env bash
set -euo pipefail

SPEC_DIR="${1:-spec}"
MAX_STEPS="${QUINT_MAX_STEPS:-12}"
mkdir -p "$SPEC_DIR/traces"

if ! command -v java >/dev/null 2>&1; then
  echo "❌ [Quint Prove] Java 17+ is required for Apalache/TLC model checking."
  exit 1
fi

shopt -s nullglob
for qnt in "$SPEC_DIR"/*.qnt; do
  base=$(basename "$qnt" .qnt)
  echo "=== [Quint Deep Proof] Exhaustive Model Check ($qnt, max-steps=$MAX_STEPS) ==="
  quint typecheck "$qnt"

  for inv in $(grep -o "val inv_[a-zA-Z0-9_]*" "$qnt" | awk '{print $2}'); do
    if [[ "$inv" == inv_teeth_* ]]; then
      echo "🦷 [Teeth Probe] Confirming witness '$inv' is reachable (expecting violation)..."
      if quint run --invariant="$inv" --max-steps=20 "$qnt" >/dev/null 2>&1; then
        echo "❌ [Teeth Failure] Witness '$inv' was NEVER violated! Model may be vacuously true or stuck."
        exit 1
      else
        echo "✅ [Teeth Probe] Witness '$inv' bit as expected (state is reachable)."
      fi
    else
      echo "🔒 [Formal Proof] Verifying invariant '$inv' across all states up to depth$MAX_STEPS..."
      quint verify \
        --invariant="$inv" \
        --max-steps="$MAX_STEPS" \
        --out-itf="$SPEC_DIR/traces/${base}_${inv}_counterexample.itf.json" \
        "$qnt"
    fi
  done
done

echo "✅ [Quint Deep Proof] All formal invariants discharged and teeth probes verified."
```

### 4.3 Self-Verification Model of the Harness (`spec/harness_lifecycle.qnt`)
To bootstrap Quint verification immediately, include this formal model of the Solo-SOTA Pi Harness itself in `spec/harness_lifecycle.qnt`. It proves that:
1. A feature can never be marked `passes == true` while deterministic checks are failing or while in `Plan` mode (`inv_no_unverified_pass`).
2. The agent can never exceed the 2-strike retry cap without yielding to human steering (`inv_strike_cap_enforced`).

```quint
// spec/harness_lifecycle.qnt
module harness_lifecycle {
  type Phase = Plan | ShiftBuild | QaEval | HaltedForHuman

  type State = {
    phase: Phase,
    strikes: int,
    checksGreen: bool,
    featureMarkedPass: bool,
    filesMutated: bool
  }

  var s: State

  action init = {
    s' = {
      phase: Plan,
      strikes: 0,
      checksGreen: true,
      featureMarkedPass: false,
      filesMutated: false
    }
  }

  action startShift = all {
    s.phase == Plan or s.phase == HaltedForHuman,
    s' = { ...s, phase: ShiftBuild, strikes: 0, filesMutated: false }
  }

  action mutateCode = all {
    s.phase == ShiftBuild,
    s.strikes < 2,
    s' = { ...s, filesMutated: true, checksGreen: false, featureMarkedPass: false }
  }

  action deterministicGatePass = all {
    s.phase == ShiftBuild,
    s.filesMutated,
    s' = { ...s, filesMutated: false, checksGreen: true, strikes: 0 }
  }

  action deterministicGateFail = all {
    s.phase == ShiftBuild,
    s.filesMutated,
    val nextStrikes = s.strikes + 1
    val nextPhase = if (nextStrikes >= 2) HaltedForHuman else ShiftBuild
    s' = { ...s, filesMutated: false, checksGreen: false, strikes: nextStrikes, phase: nextPhase }
  }

  action enterQa = all {
    s.phase == ShiftBuild,
    s.checksGreen,
    not(s.filesMutated),
    s.strikes < 2,
    s' = { ...s, phase: QaEval }
  }

  action qaApproveAndMarkPass = all {
    s.phase == QaEval,
    s.checksGreen,
    not(s.filesMutated),
    s' = { ...s, featureMarkedPass: true }
  }

  action qaRejectToShift = all {
    s.phase == QaEval,
    s' = { ...s, phase: ShiftBuild, featureMarkedPass: false }
  }

  action step = any {
    startShift,
    mutateCode,
    deterministicGatePass,
    deterministicGateFail,
    enterQa,
    qaApproveAndMarkPass,
    qaRejectToShift
  }

  // SAFETY INVARIANT 1: Feature is never marked passing unless in QaEval with green checks and zero uncommitted mutations
  val inv_no_unverified_pass =
    s.featureMarkedPass implies (s.phase == QaEval and s.checksGreen and not(s.filesMutated))

  // SAFETY INVARIANT 2: Strikes never exceed 2, and reaching 2 strikes immediately halts for human steering
  val inv_strike_cap_enforced =
    (s.strikes <= 2) and (s.strikes == 2 implies s.phase == HaltedForHuman)

  // TEETH WITNESS: Prove that qaApproveAndMarkPass is actually reachable (must be violated in check/prove)
  val inv_teeth_can_reach_pass = not(s.featureMarkedPass)

  run happyPathTest =
    init
      .then(startShift)
      .then(mutateCode)
      .then(deterministicGatePass)
      .then(enterQa)
      .then(qaApproveAndMarkPass)
      .expect(s.featureMarkedPass and inv_no_unverified_pass and inv_strike_cap_enforced)

  run twoStrikeHaltTest =
    init
      .then(startShift)
      .then(mutateCode)
      .then(deterministicGateFail)
      .then(mutateCode)
      .then(deterministicGateFail)
      .expect(s.phase == HaltedForHuman and s.strikes == 2)
}
```

### 4.4 The 6-Step Quint Skill (`skills/quint-formal-modeling/SKILL.md`)

```markdown
---
name: quint-formal-modeling
description: Model stateful workflows, concurrency, ordering, retries, and state machines in Quint (spec/*.qnt), run shallow/deep checks, and convert counterexample traces into deterministic unit/contract tests.
---

# Quint As-Built Sync & Temporal Bug-Finding Skill

## Routing Guidelines (When to Use vs. When NOT to Use)
- **USE THIS SKILL** when designing or debugging state machines, outbox/webhook retries, concurrent workflows, ordering invariants, or when invoking `/quint-sync`, `/quint-check`, or `/quint-prove`.
- **DO NOT USE THIS SKILL** for stateless CRUD endpoints, static UI styling, or trivial data formatting.

## The 6-Step Quint Loop (Mandatory Protocol)
1. **Sync Model to As-Built Code (`spec/<context>.md` & `spec/<context>.qnt`):**
   - Extract the state record (`var s: State`) and pure actions from `<Aggregate>Rules` and `<Context>Service`.
   - Write invariants (`val inv_<name> = ...`) stating what must NEVER happen (e.g., double-capture, stale reply overwriting newer query, orphaned outbox state) and at least one teeth witness (`val inv_teeth_<name> = not(...)`).
2. **Run Shallow Simulation First (`bash ./spec/scripts/check.sh`):**
   - Runs `quint typecheck`, `quint test`, and `quint run --max-steps=20 --max-samples=200`.
   - Reserve `bash ./spec/scripts/prove.sh` (`quint verify`) for pre-release gates or when explicitly requested via `/quint-prove`.
3. **Inspect Counterexample Trace (`spec/traces/*.itf.json`):**
   - When Quint violates an invariant, read the action sequence and nondeterministic picks (`mbt::actionTaken`, `mbt::nondetPicks`, or state transitions in the ITF JSON).
4. **Write a Deterministic Failing Test in Code BEFORE Fixing:**
   - Translate the exact state sequence from the Quint counterexample into a unit test on `<Aggregate>RulesTest` or a `<Context>ServiceTest` using `InMemory<Context>Store` and `TestClock`.
   - Run the single test and confirm it fails on the exact invariant violation Quint discovered.
5. **Fix the Domain Rule Until Green:**
   - Update `<Aggregate>` types (making the invalid state unrepresentable if possible) or `<Aggregate>Rules` guard conditions until the deterministic test and `ArchitectureTest` pass.
6. **Update the Quint Model & Re-Verify:**
   - Update `spec/<context>.qnt` so its action guard/effect matches the fixed code and re-run `bash ./spec/scripts/check.sh` until green.
```

---

## 5. Pure Guardrail Rules & Self-Improving Pi Extensions

### 5.1 Pure Guardrail Rules (`src/rules/guardrail-rules.ts`)
Keeping rule evaluation pure follows Section 3 of the engineering guardrails ("Separate effects from decisions") and allows fast unit testing via `node --test`:

```typescript
// src/rules/guardrail-rules.ts
export type GuardDecision =

| { allowed: true }
| { allowed: false; reason: string };

// Enforces Section 5: No generic buckets (utils, helpers, common, misc, manager, handler, *Impl)
const BANNED_FILENAME_REGEX =
  /(?:^|\/)(?:utils?|helpers?|common|misc|base|manager|handler|data|info|[A-Z][a-zA-Z0-9]*Impl|[A-Z][a-zA-Z0-9]*Manager|[A-Z][a-zA-Z0-9]*Helper)\.(?:kt|ts|tsx|rs|py|java)$/i;

const BANNED_FOLDER_REGEX = /(?:^|\/)(?:utils?|helpers?|common|misc|controllers|repositories)\//i;

// Enforces Section 6: No mocking libraries; use hand-written InMemory* fakes and *Contract tests
const BANNED_MOCK_IMPORTS_REGEX =
  /\b(?:io\.mockk|org\.mockito|jest\.mock|vi\.mock|sinon|unittest\.mock)\b/;

export function evaluatePathGuard(relPath: string): GuardDecision {
  const norm = relPath.replace(/\\/g, "/");
  if ( norm === ".env" |

| norm.startsWith(".env.") |
| norm.startsWith(".git/") |
| norm.startsWith("node_modules/")) {
    return { allowed: false, reason: `PROTECTED PATH: Writing to '${norm}' is blocked.` };
  }
  if (BANNED_FOLDER_REGEX.test(norm)) {
    return {
      allowed: false,
      reason:
        `ARCHITECTURE GUARD VIOLATION (Section 1 & 5): Path '${norm}' uses a banned horizontal layer or generic bucket folder. ` +
        `REMEDIATION: Organize vertically by bounded context (<context>/<Aggregate>Rules, <Context>Ports, <Context>Service, http/, postgres/).`,
    };
  }
  if (BANNED_FILENAME_REGEX.test(norm)) {
    return {
      allowed: false,
      reason:
        `NAMING & SHAPE VIOLATION (Section 5): File '${norm}' uses a generic bucket or '*Impl/*Manager/*Helper' suffix. ` +
        `REMEDIATION: Name the file for the specific domain concept and role (e.g., CheckRules, PostgresCheckStore, InMemoryCheckStore).`,
    };
  }
  return { allowed: true };
}

export function evaluateContentGuard(relPath: string, newContent: string): GuardDecision {
  if (BANNED_MOCK_IMPORTS_REGEX.test(newContent)) {
    return {
      allowed: false,
      reason:
        `TESTING PYRAMID VIOLATION (Section 6): Mocking framework detected in '${relPath}'. ` +
        `REMEDIATION: Never use a mocking library. Write a deterministic InMemory<Context>Store fake paired with a <Port>Contract test.`,
    };
  }
  return { allowed: true };
}

export function evaluateFeatureListEdit(oldText: string, newText: string): GuardDecision {
  const stripPasses = (s: string) => s.replace(/"passes"\s*:\s*(true|false)/g, "");
  if (stripPasses(oldText) !== stripPasses(newText)) {
    return {
      allowed: false,
      reason:
        `CONTRACT VIOLATION: Modifying descriptions or steps in feature_list.json is forbidden. ` +
        `REMEDIATION: Only toggle '"passes": false' to '"passes": true' after full verification.`,
    };
  }
  return { allowed: true };
}
```

### 5.2 Quint, Plan, Shift & QA Statechart Extension (`extensions/plan-quint-qa-modes.ts`)
In addition to `/init-harness`, `/plan`, `/shift`, and `/qa`, this extension adds `/quint-sync`, `/quint-check`, and `/quint-prove` so the operator or agent can trigger the formal modeling workflow at the right cost tier:

```typescript
// extensions/plan-quint-qa-modes.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

type HarnessPhase = "normal" | "plan" | "shift" | "quint" | "qa";

export default function (pi: ExtensionAPI) {
  let phase: HarnessPhase = "normal";
  let currentPlanFile = "";

  pi.on("tool_call", async (event, ctx) => {
    const rawPath = String((event.input as any)?.path |

| (event.input as any)?.file_path |
| "").replace(/^@/, "");
    const relPath = rawPath ? path.relative(ctx.cwd, path.resolve(ctx.cwd, rawPath)).replace(/\\/g, "/") : "";

    // Protect ArchitectureTest from being weakened without explicit operator approval
    if ((event.toolName === "write" |

| event.toolName === "edit") && /ArchitectureTest|lint-architecture/.test(relPath)) {
      const ok = await ctx.ui.confirm(
        "Architecture Sensor Guard",
        `Agent is attempting to modify '${relPath}'. Per guardrails: "Never weaken ArchitectureTest to make a change fit." Allow this edit?`
      );
      if (!ok) {
        return {
          block: true,
          reason: "BLOCKED: Never weaken ArchitectureTest to make a change fit. Change the domain/adapter design instead.",
        };
      }
    }

    if (phase === "plan") {
      if (event.toolName === "write") {
        const target = path.resolve(ctx.cwd, rawPath);
        if (currentPlanFile && target !== currentPlanFile) {
          return { block: true, reason: `PLAN MODE: 'write' is only allowed for ${path.relative(ctx.cwd, currentPlanFile)}.` };
        }
      }
      if (event.toolName === "bash") {
        const cmd = String((event.input as any)?.command |

| "");
        if (/(>>|>|\brm\b|\bmv\b|\bcp\b|\bnpm\s+(i|install)|\bgit\s+(commit|push|reset|checkout))/.test(cmd)) {
          return { block: true, reason: "PLAN MODE: Mutating bash commands are blocked during read-only planning." };
        }
      }
    }
  });

  // /quint-sync <context-name>: Runs the 6-step Quint as-built sync & bug hunting loop
  pi.registerCommand("quint-sync", {
    description: "Sync spec/<context>.qnt with as-built code, run shallow check, and write failing tests for any violations",
    handler: async (args, ctx) => {
      phase = "quint";
      pi.setActiveTools(["read", "write", "edit", "bash"]);
      pi.setThinkingLevel("high");
      ctx.ui.setStatus("mode", "🔬 MODE: QUINT SYNC (SHALLOW)");

      pi.sendUserMessage(
        `[QUINT AS-BUILT SYNC LOOP]: Target context/flow: "${args |

| "active state machine"}".\n` +
          `Follow the 6-step Quint protocol from 'skills/quint-formal-modeling/SKILL.md':\n` +
          `1. Read the as-built '<Aggregate>.kt/.ts' and '<Aggregate>Rules.kt/.ts' (or state transitions) and sync 'spec/${args |

| "model"}.md' and 'spec/${args |
| "model"}.qnt'.\n` +
          `2. Run shallow verification: 'bash ./spec/scripts/check.sh' (typecheck + unit tests + 200-sample simulator).\n` +
          `3. If an invariant fails, inspect the ITF trace in 'spec/traces/', write a deterministic failing test at the lowest layer (using InMemory* fake and TestClock), fix the code until green, and re-sync the Quint model.`
      );
    },
  });

  // /quint-check: Fast shallow check (zero LLM overhead if it passes)
  pi.registerCommand("quint-check", {
    description: "Run fast shallow Quint check (typecheck + test + simulator)",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Running shallow Quint check (spec/scripts/check.sh)...", "info");
      const res = await pi.exec("bash", ["./spec/scripts/check.sh"], { cwd: ctx.cwd });
      if (res.code === 0) {
        ctx.ui.notify("✅ Quint shallow check passed!", "info");
      } else {
        ctx.ui.notify("❌ Quint shallow check found an issue. Dispatching trace to agent...", "error");
        pi.sendUserMessage(
          `[QUINT SHALLOW GATE FAILURE]: 'bash ./spec/scripts/check.sh' failed:\n\`\`\`\n${(res.stderr |

| res.stdout).slice(-3000)}\n\`\`\`\n` +
            `Write a deterministic unit/contract test reproducing this trace before fixing the code.`
        );
      }
    },
  });

  // /quint-prove: Deep exhaustive model checking before production releases
  pi.registerCommand("quint-prove", {
    description: "Run deep exhaustive Quint formal verification (Apalache/TLC + teeth probes) for pre-release signoff",
    handler: async (_args, ctx) => {
      const ok = await ctx.ui.confirm("Run Deep Quint Proof?", "This runs exhaustive model checking (quint verify) which is compute-intensive. Proceed?");
      if (!ok) return;
      ctx.ui.notify("🔒 Running exhaustive Quint model checker (spec/scripts/prove.sh)...", "info");
      const res = await pi.exec("bash", ["./spec/scripts/prove.sh"], { cwd: ctx.cwd });
      if (res.code === 0) {
        ctx.ui.notify("✅ Full Quint formal proof and teeth probes succeeded!", "info");
      } else {
        pi.sendUserMessage(
          `[QUINT DEEP PROOF COUNTEREXAMPLE]: 'bash ./spec/scripts/prove.sh' found a violation:\n\`\`\`\n${(res.stderr |

| res.stdout).slice(-3500)}\n\`\`\`\n` +
            `Inspect the generated '.itf.json' trace in 'spec/traces/', write a deterministic failing test at the lowest layer, fix the domain rule, and re-run check.sh.`
        );
      }
    },
  });
}
```

### 5.3 Self-Improvement Extension (`extensions/self-ratchet.ts`)
This extension is what enables the harness to **improve itself** after bootstrapping. Whenever you notice the agent making a repeated mistake or violating a subtle architectural rule, running `/ratchet <what went wrong>` instructs Pi to inspect its own harness files (`src/rules/guardrail-rules.ts`, `skills/*/SKILL.md`, `overlays/*`), encode a permanent mechanical check + unit test, verify via `bash ./init.sh`, and hot-reload the harness in-place:

```typescript
// extensions/self-ratchet.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // Register a tool allowing the agent to safely validate and reload the harness after self-editing
  pi.registerTool({
    name: "verify_and_reload_harness",
    label: "Verify & Hot-Reload Harness",
    description: "Runs harness unit tests and Quint shallow checks before hot-reloading Pi extensions.",
    parameters: Type.Object({
      summaryOfChange: Type.String({ description: "What harness rule, skill, or extension was improved" }),
    }),
    promptSnippet: "Verify harness unit/Quint tests and hot-reload runtime extensions",
    promptGuidelines: [
      "Use verify_and_reload_harness after modifying any file in src/rules/, extensions/, skills/, or spec/ to verify tests pass before reloading.",
    ],
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: "Running harness self-test suite and Quint shallow gate..." }] });
      const check = await pi.exec("bash", ["./init.sh"], { cwd: ctx.cwd });
      if (check.code !== 0) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Self-verification failed. Harness was NOT reloaded. Fix errors first:\n${(check.stderr |

| check.stdout).slice(-2500)}`,
            },
          ],
          details: { verified: false },
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `✅ Harness self-tests and Quint model passed for: ${params.summaryOfChange}. Run /reload-runtime to activate in session.`,
          },
        ],
        details: { verified: true, summary: params.summaryOfChange },
      };
    },
  });

  // /ratchet <observed failure mode>: Turns any recurring agent mistake into a permanent mechanical rule
  pi.registerCommand("ratchet", {
    description: "Self-improve the harness: turn an observed mistake into a mechanical rule, unit test, or negative skill example",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        ctx.ui.notify("Usage: /ratchet <describe the mistake or architectural drift to prevent permanently>", "info");
        return;
      }
      pi.setThinkingLevel("high");
      ctx.ui.setStatus("mode", "🔧 MODE: HARNESS RATCHET");

      pi.sendUserMessage(
        `[HARNESS SELF-IMPROVEMENT RATCHET]: The operator observed the following failure mode or drift:\n` +
          `"${args}"\n\n` +
          `Apply Mitchell Hashimoto's Ratchet Principle ("the harness only tightens, never loosens"):\n` +
          `1. Decide the cheapest deterministic layer that prevents this error permanently:\n` +
          `   - Pure AST/path/content guard in 'src/rules/guardrail-rules.ts' + failing-then-passing test in 'src/rules/guardrail-rules.test.ts'\n` +
          `   - Stack ArchitectureTest / linter rule in 'overlays/' with an explicit remediation message\n` +
          `   - Negative example in the relevant 'skills/*/SKILL.md' file\n` +
          `   - State invariant in 'spec/harness_lifecycle.qnt'\n` +
          `2. Implement the check and its unit test.\n` +
          `3. Call 'verify_and_reload_harness' to run './init.sh' (unit tests + Quint check), then commit the harness upgrade.`
      );
    },
  });
}
```

---

## 6. Bootstrap Execution Plan (`feature_list.json`)

Create `feature_list.json` in the root of `pi-sota-harness`. The external coding agent implements **Stage 1 (`BOOT-001` through `BOOT-004`)**. Once `BOOT-004` is green, the harness is bootstrapped and self-hosts **Stage 2 (`BOOT-005` through `BOOT-007`)** using its own `/shift`, `/quint-check`, `/qa`, and `/ratchet` commands:

```json
[
  {
    "id": "BOOT-001",
    "category": "stage1-seed",
    "description": "Scaffold package.json, AGENTS.md (~100 lines), ARCHITECTURE.md, core/AGENTS.base.md, and overlays (kotlin-gradle, ts-node, rust-cargo)",
    "steps": [
      "Verify core/AGENTS.base.md is under 115 lines and captures all 8 guardrail sections (Hexagonal vertical slices, pure Rules, Parse-don't-validate, InMemory fakes + Contracts, TestClock, Quint, Anti-entropy)",
      "Verify overlays/kotlin-gradle/init-isolated-tests.gradle.kts redirects test output directories per agentId",
      "Verify overlays/ts-node/lint-architecture.mjs emits remediation instructions when a downstream layer is imported by an upstream layer"
    ],
    "passes": false
  },
  {
    "id": "BOOT-002",
    "category": "stage1-seed",
    "description": "Implement pure guardrail rules (src/rules/guardrail-rules.ts) and deterministic unit tests (src/rules/guardrail-rules.test.ts)",
    "steps": [
      "Run 'node --test src/rules/guardrail-rules.test.ts' and verify 100% pass rate with zero mocking libraries",
      "Verify banned filenames (Utils, Helper, Common, Manager, *Impl) and banned horizontal folders (controllers/, repositories/) are rejected with remediation messages",
      "Verify mocking library imports (mockk, mockito, jest.mock, vi.mock) are rejected with instructions to use InMemory* fakes and *Contract tests",
      "Verify feature_list.json edit guard blocks any mutation outside the 'passes' boolean field"
    ],
    "passes": false
  },
  {
    "id": "BOOT-003",
    "category": "stage1-seed",
    "description": "Implement Quint formal verification gate (spec/harness_lifecycle.qnt, spec/scripts/check.sh, spec/scripts/prove.sh)",
    "steps": [
      "Run 'bash ./spec/scripts/check.sh' and verify harness_lifecycle.qnt passes quint typecheck, quint test (happyPathTest, twoStrikeHaltTest), and 200-sample quint run simulation",
      "Verify inv_no_unverified_pass and inv_strike_cap_enforced hold and inv_teeth_can_reach_pass witness is reachable"
    ],
    "passes": false
  },
  {
    "id": "BOOT-004",
    "category": "stage1-seed",
    "description": "Wire Pi extensions (solo-sota-harness.ts, plan-quint-qa-modes.ts, self-ratchet.ts), skills, and init.sh bootstrap script",
    "steps": [
      "Run 'bash ./init.sh' and confirm TypeScript typechecking, node --test suite, architecture linter, and Quint check.sh all exit 0",
      "Load extensions in Pi via 'pi --no-mcp -e ./extensions/solo-sota-harness.ts -e ./extensions/plan-quint-qa-modes.ts -e ./extensions/self-ratchet.ts' and verify status bar shows Solo-SOTA status"
    ],
    "passes": false
  },
  {
    "id": "BOOT-005",
    "category": "stage2-self-hosted",
    "description": "Self-Hosted Shift 1: Use /shift inside Pi to build the project bootstrapper CLI ('bin/apply-harness.mjs') that installs core + selected stack overlay into any target repo",
    "steps": [
      "Run 'node ./bin/apply-harness.mjs --stack kotlin-gradle --target /tmp/test-kt-repo' in a clean temp directory",
      "Verify AGENTS.md, init.sh, spec/scripts/{check,prove}.sh, and Gradle parallel test isolation script are installed cleanly"
    ],
    "passes": false
  },
  {
    "id": "BOOT-006",
    "category": "stage2-self-hosted",
    "description": "Self-Hosted Shift 2: Use /shift and /quint-sync to add bounded-context symmetry checker ('scripts/check-context-symmetry.mjs')",
    "steps": [
      "Verify the symmetry checker inspects vertical bounded context folders and flags missing *Contract tests when an outbound *Ports interface + adapter exist",
      "Verify error messages instruct the agent on the exact missing sibling file shape"
    ],
    "passes": false
  },
  {
    "id": "BOOT-007",
    "category": "stage2-self-hosted",
    "description": "Self-Hosted Shift 3: Exercise /ratchet to add an automated anti-entropy diff check blocking leftover TODOs without an owner and reason",
    "steps": [
      "Run '/ratchet Block new TODO comments unless formatted as TODO(owner): reason' inside Pi",
      "Verify Pi adds the pure rule to src/rules/guardrail-rules.ts, adds a unit test in guardrail-rules.test.ts, passes './init.sh', and updates feature_list.json via /qa"
    ],
    "passes": false
  }
]
```