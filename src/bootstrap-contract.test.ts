// Mechanical checks for the Stage 1 layout contract (feature_list.json BOOT-001..004 steps).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFeatureList } from "./rules/harness-mode-rules.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const lineCount = (text: string) => text.trimEnd().split("\n").length;

const REQUIRED_FILES = [
  "package.json",
  "init.sh",
  "AGENTS.md",
  "ARCHITECTURE.md",
  "feature_list.json",
  "claude-progress.txt",
  "core/AGENTS.base.md",
  "core/ARCHITECTURE.template.md",
  "overlays/kotlin-gradle/OVERLAY.md",
  "overlays/kotlin-gradle/init-isolated-tests.gradle.kts",
  "overlays/kotlin-gradle/ArchitectureTest.kt.template",
  "overlays/ts-node/OVERLAY.md",
  "overlays/ts-node/lint-architecture.mjs",
  "overlays/rust-cargo/OVERLAY.md",
  "spec/README.md",
  "spec/harness_lifecycle.md",
  "spec/harness_lifecycle.qnt",
  "spec/scripts/check.sh",
  "spec/scripts/prove.sh",
  "src/rules/guardrail-rules.ts",
  "src/rules/guardrail-rules.test.ts",
  "extensions/solo-sota-harness.ts",
  "extensions/plan-quint-qa-modes.ts",
  "extensions/self-ratchet.ts",
  "skills/bounded-context-design/SKILL.md",
  "skills/quint-formal-modeling/SKILL.md",
  "skills/anti-entropy-review/SKILL.md",
];

test("every file in the target repository structure exists", () => {
  const missing = REQUIRED_FILES.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
  assert.deepEqual(missing, []);
});

test("core/AGENTS.base.md is under 115 lines and covers every guardrail topic", () => {
  const base = read("core/AGENTS.base.md");
  assert.ok(lineCount(base) < 115, `AGENTS.base.md has ${lineCount(base)} lines`);
  for (const topic of [
    /Hexagonal/,
    /Vertical Bounded Contexts/,
    /\*Rules.*pure/is,
    /Parse, Don't Validate/,
    /InMemory/,
    /Contract/,
    /TestClock/,
    /Quint/,
    /Anti-Entropy/,
    /Never weaken `ArchitectureTest`/,
  ]) {
    assert.match(base, topic);
  }
});

test("root AGENTS.md is a ~100-line map", () => {
  const lines = lineCount(read("AGENTS.md"));
  assert.ok(lines >= 60 && lines <= 120, `AGENTS.md has ${lines} lines`);
});

test("gradle init script redirects every test output directory per agentId", () => {
  const script = read("overlays/kotlin-gradle/init-isolated-tests.gradle.kts");
  assert.match(script, /projectProperties\["agentId"\]/);
  assert.match(script, /PI_AGENT_ID/);
  for (const output of [/binaryResultsDirectory.*test-results-\$agentId/, /reports\.html.*reports\/tests-\$agentId/, /reports\.junitXml.*test-results-\$agentId/]) {
    assert.match(script, output);
  }
});

test("package.json is a Pi package whose manifest points at real files", () => {
  const pkg = JSON.parse(read("package.json")) as { keywords: string[]; pi: { extensions: string[]; skills: string[] } };
  assert.ok(pkg.keywords.includes("pi-package"));
  for (const rel of [...pkg.pi.extensions, ...pkg.pi.skills]) assert.ok(fs.existsSync(path.join(ROOT, rel)), rel);
});

test("feature_list.json parses and holds the seven bootstrap features", () => {
  const features = parseFeatureList(read("feature_list.json"));
  assert.ok(features);
  assert.deepEqual(features.map((f) => f.id), ["BOOT-001", "BOOT-002", "BOOT-003", "BOOT-004", "BOOT-005", "BOOT-006", "BOOT-007"]);
});

test("the Quint model declares both safety invariants, a teeth witness, and both scenario tests", () => {
  const qnt = read("spec/harness_lifecycle.qnt");
  for (const name of ["inv_no_unverified_pass", "inv_strike_cap_enforced", "inv_teeth_can_reach_pass", "happyPathTest", "twoStrikeHaltTest"]) {
    assert.match(qnt, new RegExp(`\\b(?:val|run) ${name}\\b`));
  }
});
