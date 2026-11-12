import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const CLI = fileURLToPath(new URL("../scripts/check-context-symmetry.mjs", import.meta.url));
const run = (args: string[], cwd: string) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });

function fixture(t: { after: (fn: () => void) => void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sota-symmetry-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (file: string, content = "export {};") => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  return { root, put };
}

test("CLI inspects a real vertical context, reports the missing sibling, and passes after it exists", t => {
  const { root, put } = fixture(t);
  put("billing/checks/CheckPorts.ts", "export interface CheckStore { save(): void }");
  put("billing/checks/postgres/PostgresCheckStore.ts");
  const missing = run([root], os.tmpdir());
  assert.equal(missing.status, 1, missing.stderr);
  assert.match(missing.stderr, /billing\/checks\/CheckPorts\.ts/);
  assert.match(missing.stderr, /REMEDIATION:.*billing\/checks\/CheckContract\.test\.ts/);
  put("billing/checks/CheckStoreContract.test.ts");
  const complete = run([], root);
  assert.equal(complete.status, 0, complete.stderr);
  assert.match(complete.stdout, /symmetry.*passed/i);
});

test("CLI excludes dependencies, build output and linked directories", t => {
  const { root, put } = fixture(t);
  for (const prefix of ["node_modules", "build", "dist", "target", ".git"]) {
    put(`${prefix}/checks/CheckPorts.ts`);
    put(`${prefix}/checks/postgres/CheckStore.ts`);
  }
  const outside = fixture(t);
  outside.put("checks/CheckPorts.ts");
  outside.put("checks/postgres/CheckStore.ts");
  fs.symlinkSync(outside.root, path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
  const result = run([root], os.tmpdir());
  assert.equal(result.status, 0, result.stderr);
});

test("CLI reports invalid roots and arguments as errors rather than clean checks", t => {
  const { root, put } = fixture(t);
  put("not-a-directory.ts");
  for (const args of [[path.join(root, "missing")], [path.join(root, "not-a-directory.ts")], ["--unknown"], [root, root]]) {
    const result = run(args, root);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /symmetry|usage/i);
  }
  assert.equal(run(["--help"], root).status, 0);
});
