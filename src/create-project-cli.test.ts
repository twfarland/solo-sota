import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "bin/create-project.mjs");
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_")));
const run = (target: string, cwd: string, env = process.env) =>
  spawnSync(process.execPath, [CLI, "--target", target], { cwd, env, encoding: "utf8" });
const git = (cwd: string, ...args: string[]) => spawnSync("git", args, { cwd, env: gitEnv, encoding: "utf8" });

function temporary(t: { after: (fn: () => void) => void }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sota-project-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("create-project creates a fresh Git main worktree with harness assets and project-local Pi settings", t => {
  const cwd = temporary(t);
  const target = path.join(cwd, "nested", "my app");
  const result = run(path.relative(cwd, target), cwd);
  assert.equal(result.status, 0, result.stderr);
  for (const file of ["AGENTS.md", "ARCHITECTURE.md", "init.sh", "scripts/lint-architecture.mjs",
    "spec/scripts/check.sh", "package.json", "tsconfig.json", "tests/environment.test.ts", "claude-progress.txt"]) {
    assert.ok(fs.statSync(path.join(target, file)).isFile(), file);
  }
  assert.equal(fs.readFileSync(path.join(target, "tests/environment.test.ts"), "utf8"),
    fs.readFileSync(path.join(ROOT, "overlays/ts-node/environment.test.ts.template"), "utf8"));
  assert.equal(git(target, "symbolic-ref", "HEAD").stdout.trim(), "refs/heads/main");
  assert.equal(git(target, "remote").stdout, "");
  assert.notEqual(git(target, "rev-parse", "--verify", "HEAD").status, 0, "no automatic commit");
  assert.equal(git(target, "check-ignore", ".pi/settings.json", "node_modules/example", ".env.local").status, 0);
  assert.equal(git(target, "ls-files").stdout, "", "nothing staged");
  const pi = JSON.parse(fs.readFileSync(path.join(target, ".pi/settings.json"), "utf8"));
  for (const resource of [...pi.extensions, ...pi.skills]) assert.ok(fs.existsSync(resource), resource);
  assert.equal(pi.extensions[0], path.join(ROOT, "extensions/solo-sota-harness.ts").replaceAll("\\", "/"));
  assert.equal(fs.existsSync(path.join(target, "feature_list.json")), false);
  assert.equal(fs.existsSync(path.join(target, "node_modules")), false);
  assert.equal(fs.existsSync(path.join(target, "package-lock.json")), false);
  assert.equal(fs.existsSync(path.join(target, ".git/hooks")), false, "no external Git templates copied");
  assert.match(result.stdout, /npm install/);
  assert.match(result.stdout, /trust/i);
  const again = run(target, cwd);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /exist/i);
});

test("create-project refuses existing folders, non-directory parents and nested repositories before writing", t => {
  const cwd = temporary(t);
  const existing = path.join(cwd, "existing");
  fs.mkdirSync(existing);
  fs.writeFileSync(path.join(existing, "keep.txt"), "operator data");
  assert.equal(run(existing, cwd).status, 1);
  assert.deepEqual(fs.readdirSync(existing), ["keep.txt"]);
  assert.equal(fs.readFileSync(path.join(existing, "keep.txt"), "utf8"), "operator data");
  const parent = path.join(cwd, "repo");
  fs.mkdirSync(parent);
  assert.equal(git(parent, "init", "--template=").status, 0);
  const nested = path.join(parent, "absent", "app");
  const result = run(nested, cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /repository/i);
  assert.equal(fs.existsSync(path.join(parent, "absent")), false);
  const bare = path.join(cwd, "bare.git");
  assert.equal(git(cwd, "init", "--bare", "--template=", bare).status, 0);
  const insideBare = path.join(bare, "app");
  assert.equal(run(insideBare, cwd).status, 1);
  assert.equal(fs.existsSync(insideBare), false);
  const notDirectory = run(path.join(existing, "keep.txt", "app"), cwd);
  assert.equal(notDirectory.status, 1);
  assert.equal(fs.readFileSync(path.join(existing, "keep.txt"), "utf8"), "operator data");
});

test("create-project refuses linked ancestors and missing Git without creating a target", t => {
  const cwd = temporary(t);
  const outside = path.join(cwd, "outside");
  fs.mkdirSync(outside);
  const link = path.join(cwd, "link");
  fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
  const linked = run(path.join(link, "app"), cwd);
  assert.equal(linked.status, 1);
  assert.match(linked.stderr, /symbolic link/i);
  assert.deepEqual(fs.readdirSync(outside), []);
  const target = path.join(cwd, "without-git");
  const missing = run(target, cwd, { ...process.env, PATH: "", Path: "" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /git/i);
  assert.equal(fs.existsSync(target), false);
});

test("create-project ignores inherited Git repository overrides", t => {
  const cwd = temporary(t);
  const other = path.join(cwd, "other");
  fs.mkdirSync(other);
  assert.equal(git(other, "init", "--template=", "--initial-branch=other").status, 0);
  const before = fs.readFileSync(path.join(other, ".git/config"), "utf8");
  const target = path.join(cwd, "app");
  const result = run(target, cwd, { ...process.env, GIT_DIR: path.join(other, ".git"), GIT_WORK_TREE: other });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(target, "symbolic-ref", "HEAD").stdout.trim(), "refs/heads/main");
  assert.equal(git(other, "symbolic-ref", "HEAD").stdout.trim(), "refs/heads/other");
  assert.equal(fs.readFileSync(path.join(other, ".git/config"), "utf8"), before);
  assert.deepEqual(fs.readdirSync(other), [".git"]);
});

test("create-project exposes help and fails closed on unknown options", t => {
  const cwd = temporary(t);
  const help = spawnSync(process.execPath, [CLI, "--help"], { cwd, encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  const invalid = spawnSync(process.execPath, [CLI, "--target", "app", "--force", "yes"], { cwd, encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.deepEqual(fs.readdirSync(cwd), []);
});
