#!/usr/bin/env node
// Thin filesystem adapter for the pure bootstrap manifest and renderers.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrapFiles, parseBootstrapArgs, renderAgents, renderInit, TARGET_SPEC_README } from "../src/rules/bootstrap-rules.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = "Usage: node bin/apply-harness.mjs --stack ts-node --target <directory>";

function readAsset(source) {
  return fs.readFileSync(path.join(ROOT, source), "utf8");
}

// Check every existing ancestor, including the target itself; never follow destination links.
function inspectDestination(destination) {
  let stat;
  for (let cursor = destination; ; cursor = path.dirname(cursor)) {
    try {
      const current = fs.lstatSync(cursor);
      if (current.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${cursor}`);
      if (cursor === destination) stat = current;
      else if (!current.isDirectory()) throw new Error(`Not a directory: ${cursor}`);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
    if (cursor === path.dirname(cursor)) break;
  }
  return stat;
}

function install(stack, target) {
  const files = bootstrapFiles().map(file => ({ destination: file.destination, content: readAsset(file.source) }));
  files.push(
    { destination: "AGENTS.md", content: renderAgents(readAsset("core/AGENTS.base.md"), readAsset(`overlays/${stack}/OVERLAY.md`)) },
    { destination: "init.sh", content: renderInit() },
    { destination: "spec/README.md", content: TARGET_SPEC_README },
  );
  // All predictable conflicts are rejected before creating even the target directory.
  const pending = files.filter(file => {
    const destination = path.join(target, file.destination);
    const stat = inspectDestination(destination);
    if (!stat) return true;
    if (stat.isFile() && fs.readFileSync(destination, "utf8") === file.content) return false;
    throw new Error(`Install conflict: ${destination}. Preserve your file and merge manually; nothing was overwritten.`);
  });
  for (const file of pending) {
    const destination = path.join(target, file.destination);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, file.content, { flag: "wx", mode: file.destination.endsWith(".sh") ? 0o755 : 0o644 });
  }
  console.log(`${pending.length} file(s) installed for ${stack} in ${target}.`);
}

function main(args) {
  const parsed = parseBootstrapArgs(args);
  switch (parsed.kind) {
    case "help":
      console.log(USAGE);
      return 0;
    case "error":
      console.error(`${parsed.reason}\n${USAGE}`);
      return 1;
    case "install":
      install(parsed.stack, path.resolve(parsed.target));
      return 0;
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
