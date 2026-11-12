#!/usr/bin/env node
// Existing-project adapter: preview first, preserve project ownership, back up every changed file.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrapFiles, renderAgents, renderInit, TARGET_SPEC_README } from "../src/rules/bootstrap-rules.ts";
import { CONTEXT_FILES, parseAdoptionArgs, planAdoption } from "../src/rules/adoption-rules.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = "Usage: node bin/adopt-project.mjs --target <existing-directory> [--apply] (default: read-only preview)";
const asset = source => fs.readFileSync(path.join(ROOT, source), "utf8");

function templates() {
  return [
    ...bootstrapFiles().map(file => ({ destination: file.destination, content: asset(file.source) })),
    { destination: "AGENTS.md", content: renderAgents(asset("core/AGENTS.base.md"), asset("overlays/ts-node/OVERLAY.md")) },
    { destination: "init.sh", content: renderInit() },
    { destination: "spec/README.md", content: TARGET_SPEC_README },
  ];
}

function readDestination(target, relative) {
  const destination = path.join(target, relative);
  let stat;
  for (let cursor = destination; ; cursor = path.dirname(cursor)) {
    try {
      const current = fs.lstatSync(cursor);
      if (current.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${cursor}`);
      if (cursor === destination) {
        if (!current.isFile()) throw new Error(`Not a regular file: ${cursor}`);
        if (current.nlink > 1) throw new Error(`Refusing hard-linked destination: ${cursor}`);
        stat = current;
      } else if (!current.isDirectory()) throw new Error(`Not a directory: ${cursor}`);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
    if (cursor === path.dirname(cursor)) break;
  }
  return stat ? fs.readFileSync(destination, "utf8") : undefined;
}

function snapshot(target, files) {
  const candidates = new Set([...files.map(file => file.destination), ...CONTEXT_FILES, ".pi/settings.json", ".gitignore"]);
  for (const name of [...CONTEXT_FILES, ".pi/settings.json", ".gitignore"]) candidates.add(`.solo-sota-backup/${name}`);
  return new Map([...candidates].map(name => [name, readDestination(target, name)]));
}

function showPlan(plan) {
  for (const change of plan.changes) console.log(`${change.before === undefined ? "CREATE" : "UPDATE"} ${change.destination}`);
  for (const file of plan.preserved) console.log(`REVIEW ${file}: existing project-owned file preserved; integrate required guidance/checks manually.`);
  for (const conflict of plan.conflicts) console.error(`CONFLICT ${conflict.destination}: ${conflict.reason}`);
  console.log(`REVIEW existing instructions, extension/package/global resources, tools and system prompts for conflicts.
TypeScript/Node only. Dependencies, test runners, backlog, MCP, Git and global settings are not changed.
Existing init.sh is not certified: verify compiler, tests, architecture and Quint checks before /shift.
Absolute shared-checkout paths are machine-local. Ignore rules do not untrack already tracked settings.
Backups contain original settings; keep them local and review before committing. No gates run or trust decisions granted.`);
}

function applyChanges(target, changes) {
  // Re-read the entire write set before the first write. This is not a filesystem transaction.
  for (const change of changes) {
    if (readDestination(target, change.destination) !== change.before) throw new Error(`Destination changed since inspection: ${change.destination}`);
  }
  for (const change of changes) {
    const destination = path.join(target, change.destination);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const privateFile = change.destination.startsWith(".solo-sota-backup/") || change.destination === ".pi/settings.json";
    fs.writeFileSync(destination, change.after, {
      flag: change.before === undefined ? "wx" : "w",
      mode: privateFile ? 0o600 : change.destination.endsWith(".sh") ? 0o755 : 0o644,
    });
  }
}

function main(args) {
  const parsed = parseAdoptionArgs(args);
  if (parsed.kind === "help") { console.log(USAGE); return; }
  if (parsed.kind === "error") throw new Error(`${parsed.reason}\n${USAGE}`);
  const target = path.resolve(parsed.target);
  if (target.split(/[\\/]/).some(segment => segment.toLowerCase() === ".git")) throw new Error("Refusing a target inside Git metadata.");
  if (!fs.lstatSync(target).isDirectory()) throw new Error("Target must be an existing real directory.");
  const files = templates();
  const plan = planAdoption(files, snapshot(target, files), ROOT.replaceAll("\\", "/"), target);
  console.log(`${parsed.kind === "preview" ? "PREVIEW" : "ADOPTION PLAN"}: ${target}`);
  showPlan(plan);
  if (plan.conflicts.length) throw new Error("Adoption blocked; no files changed. Resolve conflicts manually and preview again.");
  if (parsed.kind === "preview") { console.log("No files changed. Review the plan, then repeat with --apply."); return; }
  applyChanges(target, plan.changes);
  console.log(`${plan.changes.length} file(s) written. Review integration items, run bash ./init.sh, then pi and approve project trust.
If Pi is already running, use /reload (restart without --no-extensions if needed).
There is no automatic rollback; inspect partial output on infrastructure failure. Run one adopter at a time.`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
