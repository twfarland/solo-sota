import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const CLI = fileURLToPath(new URL("../scripts/check-todo-diff.mjs", import.meta.url));

function repository(t: { after: (fn: () => void) => void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sota-todo-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", env: {
      ...process.env, GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
    } });
    assert.equal(result.status, 0, result.stderr);
  };
  git("init", "--quiet");
  const put = (file: string, text: string) => fs.writeFileSync(path.join(root, file), text);
  const check = () => spawnSync(process.execPath, [CLI, root], { encoding: "utf8" });
  return { root, git, put, check };
}

test("diff gate checks tracked edits and untracked files while preserving legacy comments", t => {
  const { git, put, check } = repository(t);
  put("Check.ts", "// TODO legacy\nexport {};\n");
  git("add", "Check.ts");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "baseline");
  put("Check.ts", "// TODO legacy\nexport const n = 1;\n");
  assert.equal(check().status, 0);
  put("Check.ts", "// TODO legacy\n// TODO new issue\n");
  let result = check();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Check\.ts.*TODO GUARD/);
  assert.match(result.stderr, /TODO\(owner\): reason/);
  put("Check.ts", "// TODO legacy\n// TODO(team): handle retries\n");
  assert.equal(check().status, 0);
  put("New.ts", "// TODO later\n");
  result = check();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /New\.ts/);
  put("New.ts", "// TODO(team): handle retries\n");
  git("add", "New.ts");
  assert.equal(check().status, 0);
});

test("diff gate checks unborn repositories and staged additions", t => {
  const { git, put, check } = repository(t);
  put("New.ts", "// TODO later\n");
  git("add", "New.ts");
  assert.equal(check().status, 1);
  put("New.ts", "// TODO(team): implement validation\n");
  git("add", "New.ts");
  assert.equal(check().status, 0);
});

test("diff gate fails closed outside Git", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sota-not-git-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [CLI, root], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /not a git repository/i);
});
