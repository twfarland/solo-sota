import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialGateState, transitionGate, qaIsAuthorized, qaEvidenceMismatch, gateIsVerified, verificationCanReload,
  executionOutcome, parseGateEvent, restoreStrikes, STRIKE_ENTRY,
  type GateState, type GatePurpose,
} from "./gate-evidence-rules.ts";

const QA: GatePurpose = { kind: "qa", featureId: "A", featureListText: "backlog" };
const start = (s: GateState, id: string, purpose: GatePurpose = QA) => transitionGate(s, { kind: "started", id, purpose });
const finish = (s: GateState, id: string, outcome: "pass" | "fail" = "pass") => transitionGate(s, { kind: "finished", id, outcome });
const green = () => finish(start(initialGateState(), "qa"), "qa");

test("QA evidence binds one completed run, feature ID and backlog snapshot", () => {
  const state = green();
  assert.equal(qaIsAuthorized(state, "A", "backlog"), true);
  assert.equal(qaIsAuthorized(state, "B", "backlog"), false);
  assert.equal(qaIsAuthorized(state, "A", "changed"), false);
  assert.equal(qaEvidenceMismatch(state, "A", "backlog"), false);
  assert.equal(qaEvidenceMismatch(state, "B", "backlog"), true);
  assert.equal(qaEvidenceMismatch(state, "A", "changed"), true);
  assert.equal(gateIsVerified(state, "qa"), true);
  assert.equal(gateIsVerified(state, "other"), false);
  assert.equal(verificationCanReload(state, "qa", false), true);
  assert.equal(verificationCanReload(state, "qa", true), false);
  assert.equal(qaIsAuthorized(finish(start(initialGateState(), "check", { kind: "check" }), "check"), "A", "backlog"), false);
});

test("later gates, mutations and session resets revoke QA evidence", () => {
  const state = green();
  for (const invalidated of [
    start(state, "next"),
    finish(start(state, "next"), "next", "fail"),
    transitionGate(state, { kind: "invalidated" }),
    initialGateState(state.shift),
  ]) assert.equal(qaIsAuthorized(invalidated, "A", "backlog"), false);
});

test("mutation or overlapping gate during verification prevents a late green result", () => {
  const pending = start(initialGateState(), "qa");
  assert.equal(gateIsVerified(finish(transitionGate(pending, { kind: "invalidated" }), "qa"), "qa"), false);
  const overlap = start(pending, "other", { kind: "check" });
  assert.equal(gateIsVerified(finish(finish(overlap, "other"), "qa"), "qa"), false);
  assert.equal(gateIsVerified(finish(finish(overlap, "qa"), "other"), "other"), false);
});

test("each gate result counts once; halted remains absorbing until genuine input", () => {
  let state = finish(start(initialGateState(), "one"), "one", "fail");
  assert.deepEqual(state.shift, { kind: "building", strikes: 1 });
  assert.deepEqual(finish(state, "one", "fail"), state);
  state = finish(start(state, "two"), "two", "fail");
  assert.equal(state.shift.kind, "haltedForHuman");
  state = finish(start(state, "pass"), "pass");
  assert.equal(state.shift.kind, "haltedForHuman");
  assert.equal(gateIsVerified(state, "pass"), false);
  for (const source of ["extension", "unknown"]) {
    assert.equal(transitionGate(state, { kind: "input", source }).shift.kind, "haltedForHuman");
  }
  for (const source of ["interactive", "rpc"]) {
    assert.deepEqual(transitionGate(state, { kind: "input", source }).shift, { kind: "building", strikes: 0 });
  }
});

test("abandoned or unknown receipts cannot change another branch's strikes or evidence", () => {
  for (const state of [initialGateState({ kind: "building", strikes: 1 }), green(), start(initialGateState(), "new")]) {
    for (const outcome of ["pass", "fail"] as const) {
      assert.equal(finish(state, "abandoned", outcome), state);
    }
  }
});

test("successful gates reset a single strike and unknown receipts cannot grant green", () => {
  const one = finish(start(initialGateState(), "one"), "one", "fail");
  const reset = finish(start(one, "pass"), "pass");
  assert.deepEqual(reset.shift, { kind: "building", strikes: 0 });
  assert.equal(gateIsVerified(finish(initialGateState(), "orphan-pass"), "orphan-pass"), false);
});

test("killed, aborted or nonzero executions never count as successful verification", () => {
  assert.equal(executionOutcome({ code: 0, killed: false }, false), "pass");
  for (const [result, aborted] of [
    [{ code: 0, killed: true }, false], [{ code: 0, killed: false }, true], [{ code: 1, killed: false }, false],
  ] as const) assert.equal(executionOutcome(result, aborted), "fail");
});

test("event boundary accepts only typed gate receipts and purposes", () => {
  const id = Symbol("run");
  assert.deepEqual(parseGateEvent({ kind: "started", id, purpose: QA }), { kind: "started", id, purpose: QA });
  assert.deepEqual(parseGateEvent({ kind: "finished", id: "tool:1", outcome: "fail" }), { kind: "finished", id: "tool:1", outcome: "fail" });
  for (const value of [null, {}, { kind: "started", id, purpose: { kind: "qa" } },
    { kind: "finished", id, outcome: "cancelled" }, { kind: "finished", id: 2, outcome: "pass" }]) {
    assert.equal(parseGateEvent(value), undefined);
  }
});

test("branch strike entries restore halt across reload and invalid data fails closed", () => {
  assert.deepEqual(restoreStrikes([]), { kind: "building", strikes: 0 });
  const entries = [
    { type: "custom", customType: STRIKE_ENTRY, data: { kind: "building", strikes: 1 } },
    { type: "custom", customType: "other", data: {} },
    { type: "custom", customType: STRIKE_ENTRY, data: { kind: "haltedForHuman" } },
  ];
  assert.equal(restoreStrikes(entries).kind, "haltedForHuman");
  assert.equal(restoreStrikes([{ type: "custom", customType: STRIKE_ENTRY, data: {} }]).kind, "haltedForHuman");
});
