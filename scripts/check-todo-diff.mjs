#!/usr/bin/env node
// Read-only Git/UTF-8 adapter. The same pure rule also guards write/edit tools.
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { evaluateTodoDiffGuard } from "../src/rules/guardrail-rules.ts";

function git(args, cwd, allowAbsent = false) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (allowAbsent && result.status === 1) return undefined;
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args[0]} failed`);
  return result.stdout;
}
const paths = output => output.split("\0").filter(Boolean);

function main(args) {
  const usage = "Usage: node scripts/check-todo-diff.mjs [repository-directory]";
  if (args.length === 1 && args[0] === "--help") { console.log(usage); return 0; }
  if (args.length > 1 || args[0]?.startsWith("-")) throw new Error(usage);
  const root = git(["rev-parse", "--show-toplevel"], path.resolve(args[0] ?? ".")).trim();
  const head = git(["rev-parse", "--verify", "--quiet", "HEAD"], root, true);
  const existing = new Set(head ? paths(git(["ls-tree", "-r", "--name-only", "-z", "HEAD"], root)) : []);
  const tracked = head ? git(["diff", "--no-ext-diff", "--no-textconv", "--name-only", "-z", "HEAD", "--"], root)
    : git(["ls-files", "--cached", "-z"], root);
  const candidates = new Set([...paths(tracked), ...paths(git(["ls-files", "--others", "--exclude-standard", "-z"], root))]);
  let failures = 0;
  for (const file of [...candidates].sort()) {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute) || !fs.lstatSync(absolute).isFile()) continue;
    const after = fs.readFileSync(absolute, "utf8");
    if (after.includes("\0")) continue; // Binary files are outside this text-comment check.
    const before = existing.has(file) ? git(["show", `HEAD:${file}`], root) : "";
    const decision = evaluateTodoDiffGuard(file, before, after);
    if (!decision.allowed) { console.error(decision.reason); failures++; }
  }
  if (failures) return 1;
  console.log("TODO diff check passed (new malformed comment markers relative to HEAD).");
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(`TODO diff check error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
