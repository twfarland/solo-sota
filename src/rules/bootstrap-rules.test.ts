import { test } from "node:test";
import assert from "node:assert/strict";
import { bootstrapFiles, parseBootstrapArgs, renderAgents, renderInit } from "./bootstrap-rules.ts";

test("bootstrap arguments require TypeScript/Node and a target", () => {
  assert.deepEqual(parseBootstrapArgs(["--stack", "ts-node", "--target", "repo"]), {
    kind: "install", stack: "ts-node", target: "repo",
  });
  assert.deepEqual(parseBootstrapArgs(["--help"]), { kind: "help" });
  for (const args of [[], ["--stack", "java", "--target", "repo"], ["--stack", "ts-node"],
    ["--target", "repo"], ["--stack", "ts-node", "--target", ""],
    ["--stack", "ts-node", "--stack", "ts-node", "--target", "repo"],
    ["--target", "--stack", "ts-node"], ["--unknown", "x"]]) {
    assert.equal(parseBootstrapArgs(args).kind, "error", args.join(" "));
  }
});

test("manifest contains only core, Quint and TypeScript/Node assets", () => {
  const files = bootstrapFiles();
  assert.deepEqual(files.map(file => file.destination), [
    "core/AGENTS.base.md", "spec/scripts/check.sh", "spec/scripts/prove.sh",
    "overlays/ts-node/OVERLAY.md", "ARCHITECTURE.md", "scripts/lint-architecture.mjs", "core/SOLO-SOTA-LICENSE",
  ]);
  assert.equal(new Set(files.map(file => file.destination)).size, files.length);
  assert.ok(files.every(file => !file.source.startsWith("overlays/") || file.source.startsWith("overlays/ts-node/")));
});

test("retired stack selections fail closed", () => {
  for (const stack of ["kotlin-gradle", "rust-cargo"]) {
    assert.equal(parseBootstrapArgs(["--stack", stack, "--target", "repo"]).kind, "error");
  }
});

test("agents rendering replaces stack placeholders using the TypeScript overlay", () => {
  const core = "Fast: <STACK_CHECK_FAST_CMD>\nScoped: <STACK_SCOPED_TEST_CMD>";
  const overlay = "# Stack\n- **Fast Check:** `check build`\n- **Scoped Module Test:** `check module`";
  assert.equal(renderAgents(core, overlay), `Fast: check build\nScoped: check module\n\n${overlay}\n`);
  assert.throws(() => renderAgents(core, "# incomplete overlay"), /Golden Commands/);
});

test("generated init runs TypeScript and Quint as separate fail-fast stages from the target root", () => {
  const script = renderInit();
  assert.match(script, /set -euo pipefail/);
  assert.match(script, /cd .*BASH_SOURCE/);
  assert.match(script, /AGENT_ID/);
  assert.match(script, /bash .\/spec\/scripts\/check.sh/);
  assert.match(script, /tsc[^\n]*\nvitest[^\n]*\nnode .*scripts\/lint-architecture/);
});
