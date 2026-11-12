// Pure preview/merge decisions for adopting Solo-SOTA without replacing project-owned configuration.
import * as path from "node:path";
import { harnessResources } from "./bootstrap-rules.ts";

type AdoptionArgs = { readonly kind: "help" } | { readonly kind: "error"; readonly reason: string }
  | { readonly kind: "preview" | "apply"; readonly target: string };
type TextResult = { readonly kind: "text"; readonly text: string } | { readonly kind: "error"; readonly reason: string };
type Template = { readonly destination: string; readonly content: string };
type Change = { readonly destination: string; readonly before: string | undefined; readonly after: string };
type Conflict = { readonly destination: string; readonly reason: string };
type Snapshot = ReadonlyMap<string, string | undefined>;

export const CONTEXT_FILES = ["AGENTS.override.md", "AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];
const START = "<!-- solo-sota:harness:start -->";
const END = "<!-- solo-sota:harness:end -->";
const IGNORE = "# Solo-SOTA local migration files\n/.solo-sota-backup/\n/.pi/settings.json\n";
const PROJECT_OWNED = new Set(["ARCHITECTURE.md", "init.sh", "spec/README.md"]);

export function parseAdoptionArgs(args: readonly string[]): AdoptionArgs {
  if (args.length === 1 && args[0] === "--help") return { kind: "help" };
  let target: string | undefined;
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--apply" && !apply) apply = true;
    else if (arg === "--target" && target === undefined && args[i + 1]?.trim() && !args[i + 1]?.startsWith("--")) {
      target = args[++i];
    } else return { kind: "error", reason: "Expected --target <existing-directory> [--apply]; no duplicate or unknown options." };
  }
  return target ? { kind: apply ? "apply" : "preview", target } : { kind: "error", reason: "An existing --target is required." };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergePiSettings(before: string | undefined, harnessRoot: string, projectRoot: string): TextResult {
  let settings: unknown;
  try { settings = JSON.parse(before ?? "{}"); }
  catch { return { kind: "error", reason: "Settings must be strict JSON; merge comments/trailing commas manually first." }; }
  if (!isRecord(settings)) return { kind: "error", reason: "Settings must be a JSON object." };
  const desired = harnessResources(harnessRoot);
  let changed = false;
  for (const key of ["extensions", "skills"] as const) {
    const current: unknown = settings[key] === undefined ? [] : settings[key];
    if (!Array.isArray(current) || !current.every((entry: unknown) => typeof entry === "string")) {
      return { kind: "error", reason: `${key} must be an array of strings.` };
    }
    if (current.some(entry => /^[!-](?!builtin:)/.test(entry))) {
      return { kind: "error", reason: `${key} contains exclusions; resolve resource conflicts manually before adoption.` };
    }
    const location = (entry: string) => path.resolve(projectRoot, ".pi", entry.replace(/^\+/, ""));
    const merged: string[] = [...current];
    for (const resource of desired[key]) {
      if (key === "extensions" && current.some(entry => path.basename(entry.replace(/^\+/, "")) === path.basename(resource) && location(entry) !== location(resource))) {
        return { kind: "error", reason: `Another explicit harness copy references ${path.basename(resource)}; select one checkout manually.` };
      }
      if (!merged.some(entry => location(entry) === location(resource))) { merged.push(resource); changed = true; }
    }
    settings[key] = merged;
  }
  return { kind: "text", text: !changed && before !== undefined ? before : JSON.stringify(settings, null, 2) + "\n" };
}

function mergeInstructions(before: string | undefined, guidance: string): TextResult {
  if (before === undefined || before === guidance) return { kind: "text", text: guidance };
  const block = `${START}\n${guidance.trimEnd()}\n${END}\n`;
  if (before.includes(START) || before.includes(END)) {
    if (before.split(START).length === 2 && before.split(END).length === 2 && before.includes(block)) {
      return { kind: "text", text: before };
    }
    return { kind: "error", reason: "Managed guidance differs or has ambiguous markers; merge manually without weakening guards." };
  }
  return { kind: "text", text: before + (before.endsWith("\n") ? "\n" : "\n\n") + block };
}

function backupChanges(changes: readonly Change[], snapshot: Snapshot, conflicts: Conflict[]): Change[] {
  const backups: Change[] = [];
  for (const change of changes) {
    if (change.before === undefined) continue;
    const destination = `.solo-sota-backup/${change.destination}`;
    const before = snapshot.get(destination);
    if (before !== undefined && before !== change.before) conflicts.push({ destination, reason: "Backup already exists with different content; archive it manually before another migration." });
    if (before === undefined) backups.push({ destination, before, after: change.before });
  }
  return backups;
}

export function planAdoption(templates: readonly Template[], snapshot: Snapshot, harnessRoot: string, projectRoot: string): {
  readonly changes: readonly Change[]; readonly conflicts: readonly Conflict[]; readonly preserved: readonly string[];
} {
  const changes: Change[] = [];
  const conflicts: Conflict[] = [];
  const preserved: string[] = [];
  const add = (destination: string, result: TextResult) => {
    if (result.kind === "error") conflicts.push({ destination, reason: result.reason });
    else if (snapshot.get(destination) !== result.text) changes.push({ destination, before: snapshot.get(destination), after: result.text });
  };
  for (const file of templates) {
    if (file.destination === "AGENTS.md") {
      const active = CONTEXT_FILES.find(name => snapshot.get(name) !== undefined) ?? "AGENTS.md";
      add(active, mergeInstructions(snapshot.get(active), file.content));
      continue;
    }
    const before = snapshot.get(file.destination);
    if (before === file.content) continue;
    if (before !== undefined && PROJECT_OWNED.has(file.destination)) { preserved.push(file.destination); continue; }
    if (before !== undefined) conflicts.push({ destination: file.destination, reason: "Existing harness asset differs; preserve it and merge manually." });
    else add(file.destination, { kind: "text", text: file.content });
  }
  add(".pi/settings.json", mergePiSettings(snapshot.get(".pi/settings.json"), harnessRoot, projectRoot));
  const ignore = snapshot.get(".gitignore") ?? "";
  add(".gitignore", { kind: "text", text: ignore.includes(IGNORE) ? ignore : ignore + (ignore.endsWith("\n") || !ignore ? "" : "\n") + IGNORE });
  return { changes: [...backupChanges(changes, snapshot, conflicts), ...changes], conflicts, preserved };
}
