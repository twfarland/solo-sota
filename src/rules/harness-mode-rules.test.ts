import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countPassing,
  evaluateModeToolCall,
  formatModeStatus,
  parseFeatureList,
  planFileFor,
  selectFeature,
  type HarnessMode,
  type ModeToolCall,
} from "./harness-mode-rules.ts";

const LIST = JSON.stringify(
  [
    { id: "BOOT-001", description: "a", steps: [], passes: true },
    { id: "BOOT-002", description: "b", steps: [], passes: false },
  ],
  null,
  2,
);
const markSecondPassing = LIST.replace(/"passes": false/, '"passes": true');
const featureListCall = (currentText: string, nextText: string): ModeToolCall => ({
  kind: "fileMutation",
  relPath: "feature_list.json",
  currentText,
  nextText,
});

const ALL_MODES: HarnessMode[] = [
  { kind: "normal" },
  { kind: "plan", planFile: "plans/x.md" },
  { kind: "shift", featureId: "BOOT-002" },
  { kind: "quint", target: "harness_lifecycle" },
  { kind: "qa", featureId: "BOOT-002", checksGreen: false },
];

// inv_no_unverified_pass, as code.
test("marking a feature passing is blocked outside a green QA phase", () => {
  for (const mode of ALL_MODES) {
    const decision = evaluateModeToolCall(mode, featureListCall(LIST, markSecondPassing));
    assert.equal(decision.allowed, false, mode.kind);
    assert.match(decision.allowed ? "" : decision.reason, mode.kind === "plan" ? /PLAN MODE/ : /UNVERIFIED PASS.*REMEDIATION/s);
  }
  assert.deepEqual(
    evaluateModeToolCall({ kind: "qa", featureId: "BOOT-002", checksGreen: true }, featureListCall(LIST, markSecondPassing)),
    { allowed: true },
  );
});

test("pass-count-neutral swaps still require green QA for the selected feature", () => {
  const swap = LIST.replace('"passes": true', '"passes": false').replace(/("id": "BOOT-002"[\s\S]*?)"passes": false/, '$1"passes": true');
  assert.equal(countPassing(swap), countPassing(LIST));
  for (const mode of ALL_MODES) {
    assert.equal(evaluateModeToolCall(mode, featureListCall(LIST, swap)).allowed, false, mode.kind);
  }
  assert.equal(evaluateModeToolCall({ kind: "qa", featureId: "BOOT-002", checksGreen: true }, featureListCall(LIST, swap)).allowed, true);
});

test("green QA cannot approve another feature or an unspecified feature", () => {
  for (const featureId of ["BOOT-001", undefined]) {
    assert.equal(evaluateModeToolCall({ kind: "qa", featureId, checksGreen: true }, featureListCall(LIST, markSecondPassing)).allowed, false);
  }
  const nonePass = LIST.replace('"passes": true', '"passes": false');
  assert.equal(evaluateModeToolCall({ kind: "qa", featureId: "BOOT-002", checksGreen: true }, featureListCall(nonePass, markSecondPassing)).allowed, false);
});

test("Plan cannot change the feature list even to clear a pass or leave it unchanged", () => {
  const plan: HarnessMode = { kind: "plan", planFile: "plans/x.md" };
  assert.equal(evaluateModeToolCall(plan, featureListCall(markSecondPassing, LIST)).allowed, false);
  assert.equal(evaluateModeToolCall(plan, featureListCall(LIST, LIST)).allowed, false);
});

test("mode guard fails closed for malformed lists and contract changes", () => {
  const qa: HarnessMode = { kind: "qa", featureId: "BOOT-002", checksGreen: true };
  for (const next of ["{}", LIST.replace('"b"', '"rewritten"'), LIST.replace('"passes": false', '')]) {
    assert.equal(evaluateModeToolCall(qa, featureListCall(LIST, next)).allowed, false);
  }
});

test("green QA rejects nested contract changes even alongside an authorized approval", () => {
  const before = JSON.stringify([{
    id: "BOOT-002", description: "b", steps: [], passes: false, metadata: { passes: false },
  }]);
  const after = before.replaceAll('"passes":false', '"passes":true');
  assert.equal(evaluateModeToolCall({ kind: "qa", featureId: "BOOT-002", checksGreen: true }, featureListCall(before, after)).allowed, false);
});

test("un-marking a feature (regression) remains allowed during a shift", () => {
  assert.deepEqual(evaluateModeToolCall({ kind: "shift", featureId: undefined }, featureListCall(markSecondPassing, LIST)), { allowed: true });
});

test("plan mode allows only the plan file and read-only shell", () => {
  const plan: HarnessMode = { kind: "plan", planFile: "plans/x.md" };
  assert.equal(evaluateModeToolCall(plan, { kind: "fileMutation", relPath: "plans/x.md", currentText: undefined, nextText: "# plan" }).allowed, true);
  assert.equal(evaluateModeToolCall(plan, { kind: "fileMutation", relPath: "src/a.ts", currentText: "", nextText: "x" }).allowed, false);
  assert.equal(evaluateModeToolCall(plan, { kind: "shell", command: "git log" }).allowed, true);
  assert.equal(evaluateModeToolCall(plan, { kind: "shell", command: "rm -rf src" }).allowed, false);
});

test("qa mode blocks code edits and mutating shell but allows running the gate", () => {
  const qa: HarnessMode = { kind: "qa", featureId: undefined, checksGreen: true };
  const edit = evaluateModeToolCall(qa, { kind: "fileMutation", relPath: "src/a.ts", currentText: "", nextText: "x" });
  assert.match(edit.allowed ? "" : edit.reason, /QA MODE.*REMEDIATION: Reject back to \/shift/s);
  const shell = evaluateModeToolCall(qa, { kind: "shell", command: "git commit -m x" });
  assert.match(shell.allowed ? "" : shell.reason, /^QA MODE/);
  assert.equal(evaluateModeToolCall(qa, { kind: "shell", command: "bash ./init.sh" }).allowed, true);
});

test("shift and quint modes allow ordinary edits", () => {
  for (const mode of [ALL_MODES[2], ALL_MODES[3]] as HarnessMode[]) {
    assert.equal(evaluateModeToolCall(mode, { kind: "fileMutation", relPath: "src/a.ts", currentText: "", nextText: "x" }).allowed, true);
  }
});

test("countPassing counts true passes only", () => {
  assert.equal(countPassing(LIST), 1);
  assert.equal(countPassing(markSecondPassing), 2);
});

test("parseFeatureList parses valid lists and rejects malformed ones", () => {
  assert.deepEqual(parseFeatureList(LIST)?.map((f) => f.id), ["BOOT-001", "BOOT-002"]);
  assert.equal(parseFeatureList("{"), undefined);
  assert.equal(parseFeatureList("{}"), undefined);
  assert.equal(parseFeatureList(LIST.replace("BOOT-002", "BOOT-001")), undefined);
  assert.equal(parseFeatureList('[{"id": 1, "description": "x", "passes": false}]'), undefined);
});

test("selectFeature picks the requested id or the first pending feature", () => {
  const features = parseFeatureList(LIST) ?? [];
  assert.equal(selectFeature(features, "")?.id, "BOOT-002");
  assert.equal(selectFeature(features, " BOOT-001 ")?.id, "BOOT-001");
  assert.equal(selectFeature(features, "NOPE"), undefined);
});

test("planFileFor slugifies goals", () => {
  assert.equal(planFileFor("Add Bounded-Context symmetry checker!"), "plans/add-bounded-context-symmetry-checker.md");
  assert.equal(planFileFor("  "), "plans/plan.md");
});

test("formatModeStatus labels every mode", () => {
  assert.equal(formatModeStatus({ kind: "normal" }), undefined);
  for (const mode of ALL_MODES.slice(1)) assert.match(formatModeStatus(mode) ?? "", /MODE:/);
});
