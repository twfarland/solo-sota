import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyEdits,
  evaluateContentGuard,
  evaluateFeatureListEdit,
  evaluateFileMutation,
  evaluatePathGuard,
  evaluatePlanModeShell,
  evaluatePlanModeWrite,
  evaluateTodoDiffGuard,
  isArchitectureSensorPath,
  localContextDirs,
  parseFileMutation,
  toRelativePath,
  type GuardDecision,
} from "./guardrail-rules.ts";

function reasonOf(decision: GuardDecision): string {
  assert.equal(decision.allowed, false, "expected the guard to deny");
  return decision.allowed ? "" : decision.reason;
}

// Mocking-library fixtures are assembled from fragments so this file never trips the
// content guard itself; the harness must be able to edit its own tests (/ratchet).
const mockFixture = (...parts: string[]) => parts.join("");

test("path guard rejects banned generic-bucket filenames with remediation", () => {
  for (const file of [
    "src/Utils.kt",
    "src/util.ts",
    "orders/OrderHelper.kt",
    "orders/helpers.ts",
    "shared/common.ts",
    "billing/PaymentManager.kt",
    "billing/PaymentServiceImpl.java",
    "lib/misc.rs",
  ]) {
    const reason = reasonOf(evaluatePathGuard(file));
    assert.match(reason, /NAMING & SHAPE VIOLATION/);
    assert.match(reason, /REMEDIATION: Name the file for the specific domain concept/);
  }
});

test("path guard rejects horizontal-layer and bucket folders with remediation", () => {
  for (const file of ["api/controllers/CheckController.kt", "repositories/CheckRepo.ts", "src/utils/strings.ts", "common/x.ts"]) {
    const reason = reasonOf(evaluatePathGuard(file));
    assert.match(reason, /ARCHITECTURE GUARD VIOLATION/);
    assert.match(reason, /REMEDIATION: Organize vertically by bounded context/);
  }
});

test("path guard protects .env, .git and node_modules", () => {
  for (const file of [".env", ".env.local", ".git/config", "node_modules/x/index.js"]) {
    assert.match(reasonOf(evaluatePathGuard(file)), /PROTECTED PATH/);
  }
});

test("path guard allows well-named vertical-slice files", () => {
  for (const file of [
    "checks/CheckRules.kt",
    "checks/InMemoryCheckStore.kt",
    "checks/postgres/PostgresCheckStore.kt",
    "src/rules/guardrail-rules.ts",
    "environment.ts",
    "databases/schema.sql",
  ]) {
    assert.deepEqual(evaluatePathGuard(file), { allowed: true }, file);
  }
});

test("path guard normalises Windows separators", () => {
  assert.equal(evaluatePathGuard("api\\controllers\\X.kt").allowed, false);
});

test("content guard rejects mocking-library usage with InMemory/Contract remediation", () => {
  for (const content of [
    mockFixture("import io.", "mockk.every"),
    mockFixture("import static org.", "mockito.Mockito.when;"),
    mockFixture("import org.", "mockito.Mock"),
    mockFixture("jest", ".mock('./db');"),
    mockFixture("vi", ".mock('../store', () => ({}));"),
    mockFixture("import sinon from 'si", "non';"),
    mockFixture("const s = require('si", "non');"),
    mockFixture("from unittest", ".mock import patch"),
    mockFixture("use mock", "all::automock;"),
  ]) {
    const reason = reasonOf(evaluateContentGuard("CheckServiceTest.kt", content));
    assert.match(reason, /TESTING PYRAMID VIOLATION/);
    assert.match(reason, /InMemory<Context>Store fake paired with a <Port>Contract test/);
  }
});

test("content guard allows prose mentioning mocks and hand-written fakes", () => {
  assert.equal(evaluateContentGuard("AGENTS.md", "Never use a mocking library such as mockito or sinon.").allowed, true);
  assert.equal(evaluateContentGuard("InMemoryCheckStore.kt", "class InMemoryCheckStore : CheckStore {}").allowed, true);
});

test("new TODO comments require a nonblank owner and reason", () => {
  for (const comment of ["// TODO fix this", "# TODO: later", "/* TODO(): fix */", "// TODO(team):   ", "<!-- TODO( ): fix -->"]) {
    const reason = reasonOf(evaluateTodoDiffGuard("checks/CheckRules.ts", "", comment));
    assert.match(reason, /TODO GUARD/);
    assert.match(reason, /TODO\(owner\): reason/);
  }
  for (const comment of ["// TODO(alex): handle retries", "# TODO(@team): handle retries", "/* TODO(team): fix */", "<!-- TODO(team): fix -->"]) {
    assert.deepEqual(evaluateTodoDiffGuard("checks/CheckRules.ts", "", comment), { allowed: true });
  }
});

test("TODO guard preserves unchanged legacy markers but rejects new duplicates or regressions", () => {
  const legacy = "// TODO fix later";
  assert.equal(evaluateTodoDiffGuard("Check.ts", legacy, `${legacy}\nexport {};`).allowed, true);
  assert.equal(evaluateTodoDiffGuard("Check.ts", legacy, `${legacy}\n${legacy}`).allowed, false);
  assert.equal(evaluateTodoDiffGuard("Check.ts", legacy, "// TODO(alex): fix later").allowed, true);
  assert.equal(evaluateTodoDiffGuard("Check.ts", "// TODO(alex): fix later", legacy).allowed, false);
  assert.equal(evaluateTodoDiffGuard("Check.ts", legacy, "").allowed, true);
});

test("TODO guard checks inline and multiline comments, not quoted strings or prose", () => {
  for (const text of ["const n = 1; // TODO later", "/*\n * TODO later\n */", "<!--\nTODO later\n-->", "-- TODO later"]) {
    assert.equal(evaluateTodoDiffGuard("Check.ts", "", text).allowed, false, text);
  }
  for (const text of ['const s = "// TODO later";', "const s = '// TODO later';", "const s = `// TODO later`;", "Document TODO formatting here."]) {
    assert.equal(evaluateTodoDiffGuard("Check.ts", "", text).allowed, true, text);
  }
});

test("file-mutation guard checks TODOs in projected content, including marker assembly", () => {
  const before = "// TO later\nconst n = 1;";
  const edit = { kind: "edit" as const, path: "Check.ts", edits: [{ oldText: "TO", newText: "TODO" }] };
  assert.match(reasonOf(evaluateFileMutation("Check.ts", edit, before)), /TODO GUARD/);
  assert.equal(evaluateFileMutation("Check.ts", { kind: "write", path: "Check.ts", content: "// TODO later" }, undefined).allowed, false);
  assert.equal(evaluateFileMutation("Check.ts", { kind: "write", path: "Check.ts", content: "// TO later\nconst n = 2;" }, before).allowed, true);
});

const FEATURES = `[
  { "id": "BOOT-001", "description": "Scaffold", "steps": ["a"], "passes": false }
]`;

test("feature list guard allows toggling only the passes boolean", () => {
  assert.deepEqual(evaluateFeatureListEdit(FEATURES, FEATURES.replace('"passes": false', '"passes": true')), { allowed: true });
});

test("feature list guard blocks description, step, and id mutations", () => {
  for (const next of [
    FEATURES.replace("Scaffold", "Scaffold (simplified)"),
    FEATURES.replace('["a"]', "[]"),
    FEATURES.replace("BOOT-001", "BOOT-999"),
    "[]",
  ]) {
    assert.match(reasonOf(evaluateFeatureListEdit(FEATURES, next)), /CONTRACT VIOLATION/);
  }
});

test("feature list guard permits only top-level pass changes, not nested passes fields", () => {
  const before = JSON.stringify([{
    id: "BOOT-001", description: "Scaffold", steps: ["a"], passes: false,
    metadata: { passes: false, review: [{ passes: true }] },
  }]);
  const topLevelToggle = before.replace('"steps":["a"],"passes":false', '"steps":["a"],"passes":true');
  assert.deepEqual(evaluateFeatureListEdit(before, topLevelToggle), { allowed: true });
  for (const after of [
    before.replace('"metadata":{"passes":false', '"metadata":{"passes":true'),
    before.replace('"review":[{"passes":true}]', '"review":[{"passes":false}]'),
    topLevelToggle.replace('"metadata":{"passes":false', '"metadata":{"passes":true'),
  ]) {
    assert.match(reasonOf(evaluateFeatureListEdit(before, after)), /CONTRACT VIOLATION/);
  }
});

test("feature list guard rejects deleted booleans and malformed feature lists", () => {
  for (const next of [
    FEATURES.replace('"passes": false', ""),
    FEATURES.replace('"passes": false', '"passes": true"passes": false'),
    FEATURES.replace('"passes": false', '"passes": null'),
  ]) {
    assert.match(reasonOf(evaluateFeatureListEdit(FEATURES, next)), /CONTRACT VIOLATION/);
  }
  for (const invalid of [
    '{}',
    '[{"passes": false}]',
    '[{"id":"X","description":"x","steps":"a","passes":false}]',
    FEATURES.replace('"passes": false', '"passes": "false"'),
  ]) {
    assert.match(reasonOf(evaluateFeatureListEdit(invalid, invalid)), /CONTRACT VIOLATION/);
  }
  const soleField = '[{"passes":false}]';
  assert.match(reasonOf(evaluateFeatureListEdit(soleField, '[{}]')), /CONTRACT VIOLATION/);
});

test("parseFileMutation parses write and edit inputs and rejects malformed ones", () => {
  assert.deepEqual(parseFileMutation("write", { path: "a.ts", content: "x" }), { kind: "write", path: "a.ts", content: "x" });
  assert.deepEqual(parseFileMutation("edit", { path: "a.ts", edits: [{ oldText: "a", newText: "b" }] }), {
    kind: "edit",
    path: "a.ts",
    edits: [{ oldText: "a", newText: "b" }],
  });
  assert.equal(parseFileMutation("edit", { path: "a.ts", edits: [{ oldText: "a" }] }), undefined);
  assert.equal(parseFileMutation("write", { path: 3, content: "x" }), undefined);
  assert.equal(parseFileMutation("read", { path: "a.ts" }), undefined);
  assert.equal(parseFileMutation("write", null), undefined);
});

test("applyEdits applies targeted replacements literally and in order", () => {
  assert.equal(applyEdits("a b c", [{ oldText: "a", newText: "$&x" }, { oldText: "c", newText: "d" }]), "$&x b d");
  assert.equal(applyEdits("abc", [{ oldText: "zzz", newText: "q" }]), "abc");
});

test("evaluateFileMutation blocks feature_list.json edits that touch more than passes", () => {
  const sneaky = parseFileMutation("edit", { path: "feature_list.json", edits: [{ oldText: '["a"]', newText: "[]" }] });
  assert.ok(sneaky);
  assert.match(reasonOf(evaluateFileMutation("feature_list.json", sneaky, FEATURES)), /CONTRACT VIOLATION/);

  const honest = parseFileMutation("edit", {
    path: "feature_list.json",
    edits: [{ oldText: '"passes": false', newText: '"passes": true' }],
  });
  assert.ok(honest);
  assert.deepEqual(evaluateFileMutation("feature_list.json", honest, FEATURES), { allowed: true });
});

test("evaluateFileMutation scans only introduced text of edits", () => {
  const edit = parseFileMutation("edit", { path: "a/CheckTest.ts", edits: [{ oldText: "x", newText: mockFixture("vi", ".mock('y')") }] });
  assert.ok(edit);
  assert.match(reasonOf(evaluateFileMutation("a/CheckTest.ts", edit, "x")), /TESTING PYRAMID/);
});

test("plan mode blocks mutating shell commands and allows read-only ones", () => {
  for (const cmd of ["echo hi > out.txt", "cat a >> b", "rm -rf src", "git commit -m x", "npm i left-pad", "sed -i s/a/b/ f", "mkdir x"]) {
    assert.match(reasonOf(evaluatePlanModeShell(cmd)), /PLAN MODE/, cmd);
  }
  for (const cmd of ["ls -la", "git status", "git log --oneline", "grep -rn foo src 2>&1", "node -e \"[1].map(x => x)\"", "cat a 2>/dev/null"]) {
    assert.deepEqual(evaluatePlanModeShell(cmd), { allowed: true }, cmd);
  }
});

test("plan mode allows writing only the plan file", () => {
  assert.deepEqual(evaluatePlanModeWrite("plans/p.md", "plans/p.md"), { allowed: true });
  assert.match(reasonOf(evaluatePlanModeWrite("src/x.ts", "plans/p.md")), /only allowed for plans\/p.md/);
});

test("architecture sensor paths are recognised", () => {
  assert.equal(isArchitectureSensorPath("src/test/kotlin/ArchitectureTest.kt"), true);
  assert.equal(isArchitectureSensorPath("overlays/ts-node/lint-architecture.mjs"), true);
  assert.equal(isArchitectureSensorPath("src/rules/guardrail-rules.ts"), false);
});

test("toRelativePath normalises @-prefixed, absolute and nested paths", () => {
  const cwd = process.platform === "win32" ? "C:\\repo" : "/repo";
  const abs = process.platform === "win32" ? "C:\\repo\\src\\a.ts" : "/repo/src/a.ts";
  assert.equal(toRelativePath(cwd, "@src/a.ts"), "src/a.ts");
  assert.equal(toRelativePath(cwd, abs), "src/a.ts");
  assert.equal(toRelativePath(cwd, ""), "");
});

test("localContextDirs lists ancestor dirs nearest-first, excluding root and outside paths", () => {
  assert.deepEqual(localContextDirs("services/billing/checks/CheckRules.kt"), ["services/billing/checks", "services/billing", "services"]);
  assert.deepEqual(localContextDirs("README.md"), []);
  assert.deepEqual(localContextDirs("../elsewhere/x.ts"), []);
});
