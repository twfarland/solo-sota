import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { parseAdoptionArgs, mergePiSettings, planAdoption } from "./adoption-rules.ts";

const project = path.resolve("project");
const harness = path.resolve("shared-harness").replaceAll("\\", "/");
const templates = [
  { destination: "AGENTS.md", content: "Harness guidance\n" },
  { destination: "core/AGENTS.base.md", content: "Core rules\n" },
  { destination: "init.sh", content: "Generated gate\n" },
  { destination: "ARCHITECTURE.md", content: "Architecture template\n" },
  { destination: "spec/README.md", content: "Formal guidance\n" },
];

test("adoption defaults to preview and requires explicit, unambiguous apply", () => {
  assert.deepEqual(parseAdoptionArgs(["--target", "existing"]), { kind: "preview", target: "existing" });
  assert.deepEqual(parseAdoptionArgs(["--apply", "--target", "existing"]), { kind: "apply", target: "existing" });
  assert.deepEqual(parseAdoptionArgs(["--help"]), { kind: "help" });
  for (const args of [[], ["--apply"], ["--target", " "], ["--target", "--apply"],
    ["--target", "a", "--target", "b"], ["--target", "a", "--apply", "--apply"], ["--force"]]) {
    assert.equal(parseAdoptionArgs(args).kind, "error");
  }
});

test("Pi merge preserves unrelated settings/resources and recognizes equivalent explicit paths", () => {
  const owner = `${harness}/extensions/solo-sota-harness.ts`;
  const original = { defaultProvider: "existing", defaultTools: ["read"], theme: "dark",
    packages: [{ source: "local-package", extensions: ["custom.ts"] }],
    extensions: ["-builtin:mcp", "+" + path.relative(path.join(project, ".pi"), owner)], skills: ["./skills"] };
  const result = mergePiSettings(JSON.stringify(original), harness, project);
  assert.equal(result.kind, "text");
  if (result.kind !== "text") return;
  const merged = JSON.parse(result.text);
  for (const key of ["defaultProvider", "defaultTools", "theme", "packages"] as const) {
    assert.deepEqual(merged[key], original[key]);
  }
  assert.equal(merged.extensions.length, 4, "existing owner path is not duplicated");
  assert.deepEqual(merged.extensions.slice(0, 2), original.extensions);
  assert.deepEqual(merged.skills, ["./skills", `${harness}/skills`]);
  assert.deepEqual(mergePiSettings(result.text, harness, project), result);
});

test("Pi merge fails closed on invalid JSON, malformed arrays, exclusions and another explicit harness copy", () => {
  for (const text of ["{ // JSONC\n}", "[]", "null", '{"extensions":null}', '{"skills":[4]}',
    '{"extensions":["!**/*.ts"]}', '{"skills":["-./old"]}',
    '{"extensions":["/other/extensions/solo-sota-harness.ts"]}', '{"extensions":["+solo-sota-harness.ts"]}']) {
    assert.equal(mergePiSettings(text, harness, project).kind, "error", text);
  }
});

test("adoption preserves project-owned gates/docs, appends active instructions, backs up modifications and repeats cleanly", () => {
  const snapshot = new Map<string, string | undefined>([
    ["CLAUDE.md", "Original instructions without newline"], ["init.sh", "Custom gate\n"],
    ["ARCHITECTURE.md", "Real architecture\n"], ["spec/README.md", "Real models\n"],
    [".pi/settings.json", '{"theme":"dark"}\n'], [".gitignore", "dist/\n"],
  ]);
  const plan = planAdoption(templates, snapshot, harness, project);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.preserved, ["init.sh", "ARCHITECTURE.md", "spec/README.md"]);
  const instructions = plan.changes.find(change => change.destination === "CLAUDE.md");
  assert.ok(instructions?.after.startsWith("Original instructions without newline\n\n"));
  assert.match(instructions?.after ?? "", /solo-sota:harness:start/);
  assert.equal(plan.changes.some(change => change.destination === "AGENTS.md"), false);
  for (const destination of ["CLAUDE.md", ".pi/settings.json", ".gitignore"]) {
    assert.equal(plan.changes.find(change => change.destination === `.solo-sota-backup/${destination}`)?.after, snapshot.get(destination));
  }
  for (const change of plan.changes) snapshot.set(change.destination, change.after);
  assert.deepEqual(planAdoption(templates, snapshot, harness, project).changes, []);
});

test("override context wins, while divergent assets, managed guidance and occupied backups are conflicts", () => {
  const snapshot = new Map<string, string | undefined>([
    ["AGENTS.override.md", "Override\n"], ["AGENTS.md", "Shadowed\n"], [".pi/settings.json", '{"theme":"dark"}\n'],
  ]);
  const installed = planAdoption(templates, snapshot, harness, project);
  assert.ok(installed.changes.some(change => change.destination === "AGENTS.override.md"));
  assert.equal(installed.changes.some(change => change.destination === "AGENTS.md"), false);
  for (const change of installed.changes) snapshot.set(change.destination, change.after);
  snapshot.set("AGENTS.override.md", snapshot.get("AGENTS.override.md")?.replace("Harness guidance", "Edited guidance"));
  snapshot.set("core/AGENTS.base.md", "Operator's core");
  snapshot.set(".pi/settings.json", "{}");
  const conflicted = planAdoption(templates, snapshot, harness, project);
  for (const destination of ["AGENTS.override.md", "core/AGENTS.base.md", ".solo-sota-backup/.pi/settings.json"]) {
    assert.ok(conflicted.conflicts.some(conflict => conflict.destination === destination), destination);
  }
});
