import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProjectArgs, projectFiles } from "./project-bootstrap-rules.ts";

test("new-project arguments require an explicit target and reject ambiguous options", () => {
  assert.deepEqual(parseProjectArgs(["--target", "a new project"]), { kind: "create", target: "a new project" });
  assert.deepEqual(parseProjectArgs(["--help"]), { kind: "help" });
  for (const args of [[], ["--target"], ["--target", " "], ["--target", "--help"],
    ["--target", "a", "--target", "b"], ["--force", "yes"], ["--help", "--target", "a"]]) {
    assert.equal(parseProjectArgs(args).kind, "error", args.join(" "));
  }
});

test("project scaffold declares a strict local toolchain and machine-local Pi resources without inventing acceptance", () => {
  const manifest = projectFiles("C:/shared harness", "My App!");
  const files = new Map(manifest.map(file => [file.destination, "content" in file ? file.content : ""]));
  const pkg = JSON.parse(files.get("package.json") ?? "null");
  assert.equal(pkg.name, "my-app");
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, "module");
  assert.equal(pkg.engines.node, ">=23.6");
  assert.equal(pkg.scripts.check, "bash ./init.sh");
  for (const dependency of ["typescript", "vitest", "@types/node", "@informalsystems/quint"]) {
    assert.ok(pkg.devDependencies[dependency], dependency);
  }
  const config = JSON.parse(files.get("tsconfig.json") ?? "null");
  for (const flag of ["strict", "noEmit", "noUncheckedIndexedAccess", "exactOptionalPropertyTypes",
    "noImplicitReturns", "noUnusedLocals", "noUnusedParameters"]) assert.equal(config.compilerOptions[flag], true, flag);
  const pi = JSON.parse(files.get(".pi/settings.json") ?? "null");
  assert.deepEqual(pi.extensions, ["solo-sota-harness", "plan-quint-qa-modes", "self-ratchet"]
    .map(name => `C:/shared harness/extensions/${name}.ts`));
  assert.deepEqual(pi.skills, ["C:/shared harness/skills"]);
  assert.match(files.get(".gitignore") ?? "", /^\.pi\/settings\.json$/m);
  assert.deepEqual(manifest.find(file => file.destination === "tests/environment.test.ts"), {
    destination: "tests/environment.test.ts", source: "overlays/ts-node/environment.test.ts.template",
  });
  assert.equal(files.has("feature_list.json"), false);
  assert.equal(files.has(".git/config"), false);
  assert.match(files.get("README.md") ?? "", /trust/i);
  assert.match(files.get("README.md") ?? "", /feature_list\.json/);
});
