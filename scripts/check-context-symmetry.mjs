#!/usr/bin/env node
// Read-only filesystem adapter; naming decisions live in the pure rules module.
import * as fs from "node:fs";
import * as path from "node:path";
import { checkContextSymmetry } from "../src/rules/context-symmetry-rules.ts";

const IGNORED = new Set([".git", "node_modules", "build", "dist", "target", "coverage", ".tmp"]);
const USAGE = "Usage: node scripts/check-context-symmetry.mjs [root-directory]";

function inventory(root, relative = "") {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
    const file = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return IGNORED.has(entry.name) ? [] : inventory(root, file);
    return entry.isFile() ? [file] : [];
  });
}

function main(args) {
  if (args.length === 1 && args[0] === "--help") {
    console.log(USAGE);
    return 0;
  }
  if (args.length > 1 || args[0]?.startsWith("-")) throw new Error(USAGE);
  const root = path.resolve(args[0] ?? ".");
  if (!fs.lstatSync(root).isDirectory()) throw new Error(`Not a directory: ${root}`);
  const findings = checkContextSymmetry(inventory(root));
  for (const finding of findings) {
    console.error(`${finding.path}: missing-contract-test\nREMEDIATION: ${finding.message}`);
  }
  if (findings.length) return 1;
  console.log("Context symmetry check passed (filename convention; not proof of contract execution).");
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(`Context symmetry error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
