// Pure guardrail decisions: value in -> value out. Zero I/O, zero clock, zero randomness.
// The Pi adapter layer (extensions/*.ts) reads files and calls these functions.
import * as path from "node:path";

export type GuardDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

export type TextEdit = { readonly oldText: string; readonly newText: string };

export type FileMutation =
  | { readonly kind: "write"; readonly path: string; readonly content: string }
  | { readonly kind: "edit"; readonly path: string; readonly edits: readonly TextEdit[] };

const ALLOW: GuardDecision = { allowed: true };
const deny = (reason: string): GuardDecision => ({ allowed: false, reason });

// Right-Sized & Anti-Bloat (AGENTS.base.md §2): no generic buckets or *Impl/*Manager/*Helper suffixes.
const BANNED_FILENAME_REGEX =
  /(?:^|\/)(?:utils?|helpers?|common|misc|base|manager|handler|data|info|[A-Z][a-zA-Z0-9]*Impl|[A-Z][a-zA-Z0-9]*Manager|[A-Z][a-zA-Z0-9]*Helper)\.(?:kt|ts|tsx|rs|py|java)$/i;

// Vertical Bounded Contexts (AGENTS.base.md §1): never horizontal layers or generic bucket folders.
const BANNED_FOLDER_REGEX = /(?:^|\/)(?:utils?|helpers?|common|misc|controllers|repositories)\//i;

// Zero-Mocking Discipline (AGENTS.base.md §3): detects real usage (imports/calls), not bare words in prose.
const BANNED_MOCK_USAGE_REGEX = new RegExp(
  [
    String.raw`\bimport\s+(?:static\s+)?(?:io\.mockk|org\.mockito)\b`,
    String.raw`\bfrom\s+["'](?:sinon|jest-mock|ts-mockito|testdouble)["']`,
    String.raw`\brequire\(\s*["'](?:sinon|jest-mock|ts-mockito|testdouble)["']\s*\)`,
    String.raw`\b(?:jest|vi)\.mock\s*\(`,
    String.raw`\b(?:from\s+unittest\.mock\s+import|import\s+unittest\.mock)\b`,
    String.raw`^\s*use\s+mockall\b`,
  ].join("|"),
  "m",
);

const PROTECTED_PREFIXES = [".git/", "node_modules/"] as const;
const ARCHITECTURE_SENSOR_REGEX = /(?:^|\/)(?:ArchitectureTest[^/]*|lint-architecture[^/]*)$/;
const FEATURE_LIST_FILE = "feature_list.json";

/** Normalises a tool-supplied path (possibly absolute, `@`-prefixed, or Windows-style) relative to cwd. */
export function toRelativePath(cwd: string, rawPath: string): string {
  const stripped = rawPath.replace(/^@/, "");
  if (!stripped) return "";
  return path.relative(cwd, path.resolve(cwd, stripped)).replace(/\\/g, "/");
}

/** Parses an untyped tool-call input into a FileMutation once, at the adapter edge. */
export function parseFileMutation(toolName: string, input: unknown): FileMutation | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const record = input as Record<string, unknown>;
  const filePath = record["path"] ?? record["file_path"];
  if (typeof filePath !== "string") return undefined;
  if (toolName === "write" && typeof record["content"] === "string") {
    return { kind: "write", path: filePath, content: record["content"] };
  }
  if (toolName === "edit" && Array.isArray(record["edits"])) {
    const edits = record["edits"].filter(isTextEdit);
    return edits.length === record["edits"].length ? { kind: "edit", path: filePath, edits } : undefined;
  }
  return undefined;
}

function isTextEdit(value: unknown): value is TextEdit {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record["oldText"] === "string" && typeof record["newText"] === "string";
}

/** Applies targeted edits in order; an edit whose oldText is absent leaves the text unchanged. */
export function applyEdits(original: string, edits: readonly TextEdit[]): string {
  return edits.reduce((text, edit) => text.replace(edit.oldText, () => edit.newText), original);
}

/** The text a mutation introduces, used for content scanning. */
export function introducedText(mutation: FileMutation): string {
  switch (mutation.kind) {
    case "write":
      return mutation.content;
    case "edit":
      return mutation.edits.map((edit) => edit.newText).join("\n");
    default:
      return assertNever(mutation);
  }
}

export function evaluatePathGuard(relPath: string): GuardDecision {
  const norm = relPath.replace(/\\/g, "/");
  if (norm === ".env" || norm.startsWith(".env.") || PROTECTED_PREFIXES.some((prefix) => norm.startsWith(prefix))) {
    return deny(`PROTECTED PATH: Writing to '${norm}' is blocked.`);
  }
  if (BANNED_FOLDER_REGEX.test(norm)) {
    return deny(
      `ARCHITECTURE GUARD VIOLATION (AGENTS.base.md §1 Vertical Bounded Contexts): Path '${norm}' uses a banned horizontal layer or generic bucket folder. ` +
        `REMEDIATION: Organize vertically by bounded context (<context>/<Aggregate>Rules, <Context>Ports, <Context>Service, http/, postgres/).`,
    );
  }
  if (BANNED_FILENAME_REGEX.test(norm)) {
    return deny(
      `NAMING & SHAPE VIOLATION (AGENTS.base.md §2 Right-Sized & Anti-Bloat): File '${norm}' uses a generic bucket or '*Impl/*Manager/*Helper' suffix. ` +
        `REMEDIATION: Name the file for the specific domain concept and role (e.g., CheckRules, PostgresCheckStore, InMemoryCheckStore).`,
    );
  }
  return ALLOW;
}

export function evaluateContentGuard(relPath: string, newContent: string): GuardDecision {
  if (BANNED_MOCK_USAGE_REGEX.test(newContent)) {
    return deny(
      `TESTING PYRAMID VIOLATION (AGENTS.base.md §3 Zero-Mocking Discipline): Mocking framework detected in '${relPath}'. ` +
        `REMEDIATION: Never use a mocking library. Write a deterministic InMemory<Context>Store fake paired with a <Port>Contract test.`,
    );
  }
  return ALLOW;
}

// Lightweight lexical tokens: quoted strings, then common line/block comment forms.
const COMMENT_TOKENS = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?(?:\*\/|$)|<!--[\s\S]*?(?:-->|$)|\/\/[^\r\n]*|#[^\r\n]*|--[^\r\n]*/g;

function invalidTodoMarkers(text: string): string[] {
  return [...text.matchAll(COMMENT_TOKENS)].flatMap(([token]) => {
    if (/^["'`]/.test(token)) return [];
    const body = token.replace(/^(?:\/\/|\/\*|<!--|#|--)/, "").replace(/(?:\*\/|-->)$/, "");
    return body.split(/\r?\n/).map(line => line.trim().replace(/^\*\s?/, "")).filter(line => {
      if (!/^TODO\b/.test(line)) return false;
      const valid = line.match(/^TODO\(([^()\r\n]*)\):[ \t]+(.+)$/);
      return !valid?.[1]?.trim() || !valid[2]?.trim();
    });
  });
}

/** Reject newly introduced malformed comment markers, not unchanged legacy debt. */
export function evaluateTodoDiffGuard(relPath: string, before: string, after: string): GuardDecision {
  const remaining = new Map<string, number>();
  for (const marker of invalidTodoMarkers(before)) remaining.set(marker, (remaining.get(marker) ?? 0) + 1);
  for (const marker of invalidTodoMarkers(after)) {
    const count = remaining.get(marker) ?? 0;
    if (count === 0) return deny(`${relPath}: TODO GUARD introduces '${marker}'. REMEDIATION: Use TODO(owner): reason with a nonblank owner and reason.`);
    remaining.set(marker, count - 1);
  }
  return ALLOW;
}

export function evaluateFeatureListEdit(oldText: string, newText: string): GuardDecision {
  const stripPasses = (s: string) => s.replace(/"passes"\s*:\s*(true|false)/g, "");
  const oldContract = featureListContract(oldText);
  const newContract = featureListContract(newText);
  if (oldContract === undefined || newContract === undefined || oldContract !== newContract || stripPasses(oldText) !== stripPasses(newText)) {
    return deny(
      `CONTRACT VIOLATION: Modifying descriptions or steps in feature_list.json is forbidden. ` +
        `REMEDIATION: Only toggle '"passes": false' to '"passes": true' after full verification.`,
    );
  }
  return ALLOW;
}

/** Validates the schema and masks only each feature's top-level pass value. */
function featureListContract(text: string): string | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!Array.isArray(raw)) return undefined;
  const contract: Record<string, unknown>[] = [];
  const entries: readonly unknown[] = raw;
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) return undefined;
    const record = entry as Record<string, unknown>;
    const steps = record["steps"];
    if (typeof record["id"] !== "string" || typeof record["description"] !== "string" ||
      typeof record["passes"] !== "boolean" || !Array.isArray(steps) ||
      !steps.every((step: unknown) => typeof step === "string")) return undefined;
    contract.push({ ...record, passes: false });
  }
  return JSON.stringify(contract);
}

export function isFeatureListPath(relPath: string): boolean {
  return relPath === FEATURE_LIST_FILE;
}

export function isArchitectureSensorPath(relPath: string): boolean {
  return ARCHITECTURE_SENSOR_REGEX.test(relPath);
}

/**
 * Evaluates every pure guard for a file mutation. `currentText` is the file's present content
 * (undefined when absent), used for introduced TODO markers and the backlog contract.
 */
export function evaluateFileMutation(relPath: string, mutation: FileMutation, currentText: string | undefined): GuardDecision {
  const pathDecision = evaluatePathGuard(relPath);
  if (!pathDecision.allowed) return pathDecision;
  const contentDecision = evaluateContentGuard(relPath, introducedText(mutation));
  if (!contentDecision.allowed) return contentDecision;
  const nextText = mutation.kind === "write" ? mutation.content : applyEdits(currentText ?? "", mutation.edits);
  const todoDecision = evaluateTodoDiffGuard(relPath, currentText ?? "", nextText);
  if (!todoDecision.allowed) return todoDecision;
  if (isFeatureListPath(relPath) && currentText !== undefined) {
    return evaluateFeatureListEdit(currentText, nextText);
  }
  return ALLOW;
}

const MUTATING_SHELL_REGEX =
  /(?:>>|(?<![<>=!-])>(?![&=]|\s*\/dev\/null)|\brm\b|\bmv\b|\bcp\b|\btouch\b|\bmkdir\b|\bsed\s+-i\b|\bnpm\s+(?:i|install|ci|uninstall)\b|\bgit\s+(?:add|commit|push|reset|checkout|merge|rebase|stash|clean)\b)/;

/** Plan mode is read-only: any shell command that can mutate the tree or history is refused. */
export function evaluatePlanModeShell(command: string): GuardDecision {
  return MUTATING_SHELL_REGEX.test(command)
    ? deny("PLAN MODE: Mutating bash commands are blocked during read-only planning.")
    : ALLOW;
}

/** Plan mode permits writing only the active plan file. */
export function evaluatePlanModeWrite(relPath: string, planFileRelPath: string): GuardDecision {
  return relPath === planFileRelPath
    ? ALLOW
    : deny(`PLAN MODE: 'write'/'edit' is only allowed for ${planFileRelPath}.`);
}

/**
 * Directories (relative to cwd, nearest first) whose AGENTS.md should be surfaced as local context
 * when the agent touches `relPath`. The root AGENTS.md is excluded: Pi already loads it.
 */
export function localContextDirs(relPath: string): string[] {
  const norm = relPath.replace(/\\/g, "/");
  if (!norm || norm.startsWith("../") || path.posix.isAbsolute(norm)) return [];
  const dirs: string[] = [];
  for (let dir = path.posix.dirname(norm); dir !== "." && dir !== "/"; dir = path.posix.dirname(dir)) {
    dirs.push(dir);
  }
  return dirs;
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}
