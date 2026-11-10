import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_SHIFT,
  STRIKE_CAP,
  evaluateMutationUnderStrikes,
  formatStrikeStatus,
  isDeterministicGateCommand,
  recordGateOutcome,
  strikeCount,
  type GateOutcome,
  type ShiftState,
} from "./strike-rules.ts";

const run = (outcomes: GateOutcome[]): ShiftState => outcomes.reduce(recordGateOutcome, INITIAL_SHIFT);

// Mirrors spec/harness_lifecycle.qnt `twoStrikeHaltTest`.
test("two consecutive gate failures halt for human steering", () => {
  const state = run(["fail", "fail"]);
  assert.deepEqual(state, { kind: "haltedForHuman" });
  assert.equal(strikeCount(state), STRIKE_CAP);
  const decision = evaluateMutationUnderStrikes(state);
  assert.equal(decision.allowed, false);
  assert.match(decision.allowed ? "" : decision.reason, /2-STRIKE CAP REACHED.*REMEDIATION/s);
});

test("a passing gate resets strikes (Quint deterministicGatePass)", () => {
  assert.deepEqual(run(["fail", "pass", "fail"]), { kind: "building", strikes: 1 });
});

test("halted state is absorbing until a human starts a new shift", () => {
  assert.deepEqual(run(["fail", "fail", "pass"]), { kind: "haltedForHuman" });
});

// Mirrors inv_strike_cap_enforced across every outcome sequence up to depth 6.
test("strikes never exceed the cap and reaching it always halts", () => {
  const sequences = (depth: number): GateOutcome[][] =>
    depth === 0 ? [[]] : sequences(depth - 1).flatMap((seq) => [[...seq, "pass" as const], [...seq, "fail" as const]]);
  for (const seq of sequences(6)) {
    const state = run(seq);
    assert.ok(strikeCount(state) <= STRIKE_CAP);
    assert.equal(strikeCount(state) === STRIKE_CAP, state.kind === "haltedForHuman");
  }
});

test("deterministic gate commands are recognised across stacks", () => {
  for (const cmd of [
    "bash ./init.sh",
    "node --test src/rules/guardrail-rules.test.ts",
    "bash ./spec/scripts/check.sh",
    "npm test",
    "npm run typecheck",
    "npx tsc --noEmit",
    "./gradlew test --init-script x.kts",
    "cargo test -p billing",
  ]) {
    assert.equal(isDeterministicGateCommand(cmd), true, cmd);
  }
  for (const cmd of ["ls", "git status", "cat init.sh.bak | head", "echo testing"]) {
    assert.equal(isDeterministicGateCommand(cmd), false, cmd);
  }
});

test("status text reflects strike state", () => {
  assert.match(formatStrikeStatus(INITIAL_SHIFT), /Solo-SOTA.*strikes 0\/2/);
  assert.match(formatStrikeStatus({ kind: "haltedForHuman" }), /HALTED/);
});
