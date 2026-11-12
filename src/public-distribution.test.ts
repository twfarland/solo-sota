import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const PUBLIC_DOCS = ["README.md", "CONTRIBUTING.md", "SECURITY.md", "docs/setup.md", "docs/runtime.md",
  "docs/checks.md", "docs/adoption.md", "docs/evaluation.md", "docs/publishing.md"];

test("public documentation has resolvable local file links and no personal home-directory examples", () => {
  for (const file of PUBLIC_DOCS) {
    const text = read(file);
    assert.doesNotMatch(text, /C:\/Users\/|C:\\Users\\|\/home\/[^/\s]+\/|\/Users\/[^/\s]+\//, file);
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const href = match[1];
      if (!href || /^(?:https?:|mailto:|#)/.test(href)) continue;
      const local = path.resolve(ROOT, path.dirname(file), href.split("#")[0] ?? "");
      assert.ok(!path.relative(ROOT, local).startsWith(".."), `${file}: outside-repo link ${href}`);
      assert.ok(fs.existsSync(local), `${file}: missing link ${href}`);
    }
  }
});

test("source-sharing metadata keeps npm publishing private and licensing explicit", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.private, true);
  assert.equal(pkg.license, "MIT");
  assert.match(read("LICENSE"), /MIT License/);
  assert.match(read("LICENSE"), /Permission is hereby granted, free of charge/);
  assert.match(read("LICENSE"), /THE SOFTWARE IS PROVIDED "AS IS"/);
  assert.equal(pkg.repository.url, "git+https://github.com/twfarland/solo-sota.git");
  assert.equal(pkg.bugs.url, "https://github.com/twfarland/solo-sota/issues");
  assert.doesNotMatch(read("README.md"), /license selection is pending/i);
});

test("CI pins its actions, grants read-only contents and runs the full gate on Linux and Windows", () => {
  const workflow = read(".github/workflows/verify.yml");
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /node-version: ['"]?24/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm audit --audit-level=low/);
  assert.match(workflow, /bash \.\/init\.sh/);
  assert.doesNotMatch(workflow, /pull_request_target|write-all|secrets:/);
  const actions = [...workflow.matchAll(/uses:\s*(\S+)/g)];
  assert.ok(actions.length >= 2);
  for (const action of actions) assert.match(action[1] ?? "", /@[a-f0-9]{40}$/);
});

test("Git ignores local credentials/configuration, migration backups and generated output without creating files", () => {
  const paths = [".env", ".env.local", ".pi/settings.json", ".pi/mcp.json", ".solo-sota-backup/.pi/settings.json",
    "node_modules/example", ".tmp/report.json", "coverage/result.json", "spec/traces/example.itf.json"];
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_")));
  const result = spawnSync("git", ["check-ignore", "--no-index", "--stdin"], {
    cwd: ROOT, env, input: paths.join("\n") + "\n", encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), paths);
});
