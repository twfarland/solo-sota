import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "bin/adopt-project.mjs");
const run = (target: string, apply = false) => spawnSync(process.execPath,
  [CLI, "--target", target, ...(apply ? ["--apply"] : [])], { encoding: "utf8" });

function fixture(t: { after: (fn: () => void) => void }): string {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "sota-adopt project-"));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  fs.mkdirSync(path.join(target, ".pi"));
  fs.writeFileSync(path.join(target, "AGENTS.md"), "Keep these project instructions.\n");
  fs.writeFileSync(path.join(target, ".pi/settings.json"), '{ "theme": "dark", "extensions": ["./custom.ts"] }\n');
  fs.writeFileSync(path.join(target, ".pi/mcp.json"), "existing MCP configuration\n");
  fs.writeFileSync(path.join(target, "package.json"), '{"scripts":{"test":"node --test"}}\n');
  fs.writeFileSync(path.join(target, "tsconfig.json"), '{"compilerOptions":{"strict":true}}\n');
  fs.writeFileSync(path.join(target, "README.md"), "Existing application readme\n");
  fs.writeFileSync(path.join(target, "LICENSE"), "Application license stays unchanged\n");
  fs.writeFileSync(path.join(target, "feature_list.json"), '[{"id":"APP-1","description":"Real goal","steps":["Real criterion"],"passes":false}]\n');
  fs.writeFileSync(path.join(target, "init.sh"), "#!/usr/bin/env bash\nexit 7\n");
  fs.writeFileSync(path.join(target, "ARCHITECTURE.md"), "Real architecture\n");
  fs.writeFileSync(path.join(target, ".gitignore"), "dist/\n");
  return target;
}

function snapshot(root: string): Map<string, string> {
  const result = new Map<string, string>();
  function visit(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).replaceAll("\\", "/");
      result.set(relative, entry.isDirectory() ? "directory" : fs.readFileSync(absolute).toString("hex"));
      if (entry.isDirectory()) visit(absolute);
    }
  }
  visit(root);
  return result;
}

test("adoption previews without writes, then merges with backups while preserving Git/history/project files", t => {
  const target = fixture(t);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_")));
  const git = (...args: string[]) => spawnSync("git", args, { cwd: target, env, encoding: "utf8" });
  assert.equal(git("init", "--template=", "--initial-branch=main").status, 0);
  assert.equal(git("add", ".").status, 0);
  assert.equal(git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false",
    "-c", "core.hooksPath=.git/no-hooks", "commit", "-m", "Existing project").status, 0);
  const before = snapshot(target);
  assert.equal(run(path.join(target, ".git"), true).status, 1, "Git metadata is not a project target");
  const preview = run(target);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /preview/i);
  assert.match(preview.stdout, /REVIEW.*init\.sh/);
  assert.deepEqual(snapshot(target), before);
  const applied = run(target, true);
  assert.equal(applied.status, 0, applied.stderr);
  const after = snapshot(target);
  for (const [relative, bytes] of before) {
    if (!["AGENTS.md", ".pi/settings.json", ".gitignore"].includes(relative)) {
      assert.equal(after.get(relative), bytes, relative);
    }
  }
  const read = (file: string) => fs.readFileSync(path.join(target, file), "utf8");
  for (const file of ["AGENTS.md", ".pi/settings.json", ".gitignore"]) {
    assert.equal(Buffer.from(read(`.solo-sota-backup/${file}`)).toString("hex"), before.get(file));
  }
  assert.ok(read("AGENTS.md").startsWith("Keep these project instructions.\n"));
  assert.equal(read("core/SOLO-SOTA-LICENSE"), fs.readFileSync(path.join(ROOT, "LICENSE"), "utf8"));
  const settings = JSON.parse(read(".pi/settings.json"));
  assert.equal(settings.theme, "dark");
  assert.equal(settings.extensions[0], "./custom.ts");
  assert.equal(settings.extensions.length, 4);
  assert.equal(git("check-ignore", ".solo-sota-backup/AGENTS.md").status, 0);
  const migrated = snapshot(target);
  const repeat = run(target, true);
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.match(repeat.stdout, /0 file/);
  assert.deepEqual(snapshot(target), migrated);
});

test("divergent harness assets block all adoption changes", t => {
  const target = fixture(t);
  fs.mkdirSync(path.join(target, "scripts"));
  fs.writeFileSync(path.join(target, "scripts/lint-architecture.mjs"), "Operator's architecture sensor\n");
  const before = snapshot(target);
  const result = run(target, true);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /conflict.*lint-architecture/i);
  assert.deepEqual(snapshot(target), before);
});

test("invalid settings, explicit exclusions and modified managed instructions refuse mutation", t => {
  for (const settings of ["{ // comments\n}", '{"extensions":["!**/*.ts"]}']) {
    const target = fixture(t);
    fs.writeFileSync(path.join(target, ".pi/settings.json"), settings);
    const before = snapshot(target);
    assert.equal(run(target, true).status, 1);
    assert.deepEqual(snapshot(target), before);
  }
  const target = fixture(t);
  assert.equal(run(target, true).status, 0);
  const file = path.join(target, "AGENTS.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("Hexagonal Domain Purity", "Operator-edited policy"));
  const before = snapshot(target);
  assert.equal(run(target, true).status, 1);
  assert.deepEqual(snapshot(target), before);
});

test("adoption refuses symlinked parents and hard-linked mutable files before writing", t => {
  const target = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "sota-adopt-outside-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.rmSync(path.join(target, ".pi"), { recursive: true });
  fs.symlinkSync(outside, path.join(target, ".pi"), process.platform === "win32" ? "junction" : "dir");
  const linked = run(target, true);
  assert.equal(linked.status, 1);
  assert.match(linked.stderr, /symbolic link/i);
  assert.deepEqual(fs.readdirSync(outside), []);
  const hard = fixture(t);
  fs.linkSync(path.join(hard, "AGENTS.md"), path.join(outside, "instructions.md"));
  const before = snapshot(hard);
  const result = run(hard, true);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /hard.link/i);
  assert.deepEqual(snapshot(hard), before);
});

test("adoption requires an existing target and exposes help without a force flag", t => {
  const target = fixture(t);
  const missing = path.join(target, "absent");
  assert.equal(run(missing, true).status, 1);
  assert.equal(fs.existsSync(missing), false);
  const help = spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  const invalid = spawnSync(process.execPath, [CLI, "--target", target, "--force"], { encoding: "utf8" });
  assert.equal(invalid.status, 1);
});
