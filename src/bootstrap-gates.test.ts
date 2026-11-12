// Execute generated Bash control flow with controlled TypeScript/Node executables.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { renderInit } from "./rules/bootstrap-rules.ts";

const EXECUTABLE = `#!/usr/bin/env bash
set -euo pipefail
case "\${0##*/}" in
  node) stage=lint ;;
  check.sh) stage=quint ;;
  *) stage="\${0##*/}" ;;
esac
printf '%s\\n' "$stage" >> trace.log
if [[ "$stage" == "$FAIL_STAGE" ]]; then exit 17; fi
`;

const stages = ["tsc", "vitest", "lint", "quint"];

test("generated TypeScript gate stops at every failed stage and reaches all stages on success", t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "sota-gate-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.mkdirSync(path.join(cwd, "node_modules/.bin"), { recursive: true });
  fs.mkdirSync(path.join(cwd, "spec/scripts"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "init.sh"), renderInit());
  for (const name of ["tsc", "vitest", "node"]) {
    fs.writeFileSync(path.join(cwd, "node_modules/.bin", name), EXECUTABLE, { mode: 0o755 });
  }
  fs.writeFileSync(path.join(cwd, "spec/scripts/check.sh"), EXECUTABLE);
  for (const failure of [...stages, ""]) {
    fs.rmSync(path.join(cwd, "trace.log"), { force: true });
    const result = spawnSync("bash", ["./init.sh"], {
      cwd, encoding: "utf8", env: { ...process.env, FAIL_STAGE: failure },
    });
    assert.equal(result.status, failure ? 17 : 0, `${failure || "success"}: ${result.stderr}`);
    const expected = failure ? stages.slice(0, stages.indexOf(failure) + 1) : stages;
    assert.deepEqual(fs.readFileSync(path.join(cwd, "trace.log"), "utf8").trim().split("\n"), expected);
  }
});
