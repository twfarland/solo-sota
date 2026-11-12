import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "bin/apply-harness.mjs");
const run = (args: string[], cwd: string) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });

function temporary(t: { after: (fn: () => void) => void }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sota-bootstrap-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("CLI installs TypeScript/Node from another cwd and is repeatable without overwrites", t => {
  const cwd = temporary(t);
  const target = path.join(cwd, "ts-node repo");
  const args = ["--stack", "ts-node", "--target", target];
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "LICENSE"), "Application's own license\n");
  const result = run(args, cwd);
  assert.equal(result.status, 0, result.stderr);
  for (const file of ["AGENTS.md", "ARCHITECTURE.md", "core/AGENTS.base.md", "init.sh", "spec/README.md",
    "spec/scripts/check.sh", "spec/scripts/prove.sh", "overlays/ts-node/OVERLAY.md"]) {
    assert.ok(fs.statSync(path.join(target, file)).isFile(), file);
  }
  const agents = fs.readFileSync(path.join(target, "AGENTS.md"), "utf8");
  assert.doesNotMatch(agents, /<STACK_\w+>/);
  assert.match(agents, /Hexagonal/);
  assert.equal(fs.readFileSync(path.join(target, "core/SOLO-SOTA-LICENSE"), "utf8"),
    fs.readFileSync(path.join(ROOT, "LICENSE"), "utf8"));
  assert.equal(fs.readFileSync(path.join(target, "LICENSE"), "utf8"), "Application's own license\n");
  for (const script of ["./init.sh", "./spec/scripts/check.sh", "./spec/scripts/prove.sh"]) {
    const syntax = spawnSync("bash", ["-n", script], { cwd: target, encoding: "utf8" });
    assert.equal(syntax.status, 0, syntax.stderr);
  }
  assert.equal(fs.existsSync(path.join(target, "spec/harness_lifecycle.qnt")), false);
  assert.equal(fs.existsSync(path.join(target, "feature_list.json")), false);
  assert.equal(fs.readFileSync(path.join(target, "scripts/lint-architecture.mjs"), "utf8"),
    fs.readFileSync(path.join(ROOT, "overlays/ts-node/lint-architecture.mjs"), "utf8"));
  const again = run(args, cwd);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /0 file\(s\) installed/);
  fs.writeFileSync(path.join(target, "AGENTS.md"), "operator instructions\n");
  const conflict = run(args, cwd);
  assert.equal(conflict.status, 1);
  assert.match(conflict.stderr, /conflict.*AGENTS.md/i);
  assert.equal(fs.readFileSync(path.join(target, "AGENTS.md"), "utf8"), "operator instructions\n");
});

test("CLI preflights conflicts before writing and rejects invalid options", t => {
  const cwd = temporary(t);
  const target = path.join(cwd, "existing");
  fs.mkdirSync(path.join(target, "spec/scripts"), { recursive: true });
  fs.writeFileSync(path.join(target, "spec/scripts/prove.sh"), "existing proof gate");
  const conflict = run(["--stack", "ts-node", "--target", target], cwd);
  assert.equal(conflict.status, 1);
  assert.match(conflict.stderr, /conflict/i);
  assert.equal(fs.existsSync(path.join(target, "AGENTS.md")), false);
  assert.equal(fs.existsSync(path.join(target, "init.sh")), false);
  const invalid = run(["--stack", "invalid", "--target", path.join(cwd, "absent")], cwd);
  assert.equal(invalid.status, 1);
  assert.equal(fs.existsSync(path.join(cwd, "absent")), false);
  assert.equal(run(["--help"], cwd).status, 0);
  const relative = run(["--stack", "ts-node", "--target", "relative repo"], cwd);
  assert.equal(relative.status, 0, relative.stderr);
  assert.ok(fs.existsSync(path.join(cwd, "relative repo/AGENTS.md")));
});

test("CLI rejects retired stacks without creating target files", t => {
  const cwd = temporary(t);
  for (const stack of ["kotlin-gradle", "rust-cargo"]) {
    const target = path.join(cwd, stack);
    const result = run(["--stack", stack, "--target", target], cwd);
    assert.equal(result.status, 1);
    assert.equal(fs.existsSync(target), false);
  }
});

test("CLI refuses a symlinked destination parent without writing outside target", t => {
  const cwd = temporary(t);
  const target = path.join(cwd, "target");
  const outside = path.join(cwd, "outside");
  fs.mkdirSync(target);
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(target, "spec"), process.platform === "win32" ? "junction" : "dir");
  const result = run(["--stack", "ts-node", "--target", target], cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /symbolic link/i);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.equal(fs.existsSync(path.join(target, "AGENTS.md")), false);
});
