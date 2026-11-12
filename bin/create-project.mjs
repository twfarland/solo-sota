#!/usr/bin/env node
// Fresh-project filesystem/Git adapter; reuse the existing non-overwriting harness installer.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseProjectArgs, projectFiles } from "../src/rules/project-bootstrap-rules.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = "Usage: node bin/create-project.mjs --target <new-directory>";
// Never let an inherited GIT_DIR, index, worktree or config injection redirect initialization.
const GIT_ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_")));

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
  if (result.error) throw new Error(`Git is required: ${result.error.message}`);
  return result;
}

function inspectTarget(target) {
  let nearest;
  for (let cursor = target; ; cursor = path.dirname(cursor)) {
    try {
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${cursor}`);
      if (!stat.isDirectory()) throw new Error(`Not a directory: ${cursor}`);
      if (cursor === target) throw new Error(`Destination already exists: ${target}. Use apply-harness for an existing project.`);
      nearest ??= cursor;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
    if (cursor === path.dirname(cursor)) break;
  }
  if (!nearest) throw new Error("No existing destination ancestor found.");
  const repository = git(["rev-parse", "--absolute-git-dir"], nearest);
  if (repository.status === 0) throw new Error("Refusing to create a nested repository. Choose a directory outside an existing Git repository.");
  if (!/not a git repository/i.test(repository.stderr)) throw new Error(`Cannot inspect parent repository: ${repository.stderr}`);
}

function createProject(target) {
  inspectTarget(target); // Includes Git availability and every ancestor, before any write.
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.mkdirSync(target); // Exclusive creation: a concurrent creator is not adopted.
  const installed = spawnSync(process.execPath, [path.join(ROOT, "bin/apply-harness.mjs"), "--stack", "ts-node", "--target", target],
    { encoding: "utf8" });
  if (installed.error || installed.status !== 0) throw new Error(`Harness installation failed: ${installed.error?.message ?? installed.stderr}`);
  for (const file of projectFiles(ROOT.replaceAll("\\", "/"), path.basename(target))) {
    const destination = path.join(target, file.destination);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const content = "content" in file ? file.content : fs.readFileSync(path.join(ROOT, file.source), "utf8");
    fs.writeFileSync(destination, content, { flag: "wx" });
  }
  const initialized = git(["init", "--initial-branch=main", "--template="], target);
  if (initialized.status !== 0) throw new Error(`Git initialization failed: ${initialized.stderr}`);
  console.log(`Created TypeScript project and Git repository (main): ${target}
Next: change into this directory, run npm install, then bash ./init.sh, then pi.
Review Pi's project trust prompt to enable the harness. No dependencies installed,
files staged, commits made, remotes added or global settings changed.
Define your own feature_list.json before /shift; see the generated README.md.`);
}

function main(args) {
  const parsed = parseProjectArgs(args);
  switch (parsed.kind) {
    case "help": console.log(USAGE); return;
    case "error": throw new Error(`${parsed.reason}\n${USAGE}`);
    case "create": createProject(path.resolve(parsed.target)); return;
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
