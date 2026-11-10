#!/usr/bin/env node
// Self-remediating import-boundary linter for TypeScript/JavaScript repos.
// Usage: node lint-architecture.mjs [dir ...]   (defaults to the current directory)
//
// Dependency direction (arrows point at what a module MAY import):
//   apps/, services/  ──▶  packages/          (a package never imports an app or service)
//   adapters (http/, postgres/, adapters/, extensions/, cli/)  ──▶  domain (*Rules, *Ports, *Service, rules/)
// A violation is an upstream module (package, domain) importing a downstream one (app, service, adapter),
// or domain code reaching for I/O, vendor SDKs, the real clock, or randomness.
// Every violation carries a REMEDIATION line so an agent can fix it without asking.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/;
const TEST_FILE = /(?:\.test|\.spec|Test|Contract)\.[cm]?[jt]sx?$|(?:^|\/)(?:test|tests|__tests__)\//;
const ADAPTER_SEGMENTS = new Set(["http", "postgres", "adapters", "extensions", "cli"]);
const DOMAIN_FILE = /(?:Rules|Ports|Service)\.[cm]?[jt]sx?$/;
const COMPOSITION_FILE = /Vertical\.[cm]?[jt]sx?$/;
const IO_MODULES = /^(?:node:)?(?:fs|fs\/promises|child_process|net|http|https|http2|dgram|dns|tls|worker_threads|cluster|readline|process)$/;
const IMPORT_SPECIFIERS = /(?:\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?|\bexport\s+(?:type\s+)?[^'"]*?\s+from\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;
const IMPURE_CALLS = [
  { pattern: /\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)/, what: "the real clock", fix: "inject a Clock (or pass `now` in as a value)" },
  { pattern: /\bMath\.random\s*\(/, what: "randomness", fix: "inject a Random/IdGenerator port (or pass the value in)" },
];
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".tmp"]);

/** @typedef {{ file: string, line: number, rule: string, message: string, remediation: string }} Violation */

/** @param {string} relPath */
export function classify(relPath) {
  const segments = relPath.split("/");
  const tier = ["apps", "services", "packages"].includes(segments[0] ?? "") ? segments[0] : undefined;
  const dirs = segments.slice(0, -1);
  const base = segments.at(-1) ?? "";
  let role = "unknown";
  if (TEST_FILE.test(relPath)) role = "test";
  else if (dirs.some((dir) => ADAPTER_SEGMENTS.has(dir))) role = "adapter";
  else if (COMPOSITION_FILE.test(base)) role = "composition";
  else if (DOMAIN_FILE.test(base) || dirs.includes("rules")) role = "domain";
  return { tier, role };
}

/** @param {string} source */
export function extractImports(source) {
  const imports = [];
  const lines = source.split("\n");
  lines.forEach((text, index) => {
    for (const match of text.matchAll(IMPORT_SPECIFIERS)) imports.push({ specifier: match[1], line: index + 1 });
  });
  return imports;
}

/**
 * Pure: lints one file's source. `relPath` is POSIX-style and relative to the repo root.
 * @param {string} relPath
 * @param {string} source
 * @returns {Violation[]}
 */
export function lintSource(relPath, source) {
  const from = classify(relPath);
  if (from.role === "test") return [];
  /** @type {Violation[]} */
  const violations = [];
  const report = (line, rule, message, remediation) => violations.push({ file: relPath, line, rule, message, remediation });

  for (const { specifier, line } of extractImports(source)) {
    const isRelative = specifier.startsWith(".");
    const target = isRelative ? classify(path.posix.normalize(path.posix.join(path.posix.dirname(relPath), specifier))) : undefined;

    if (from.tier === "packages" && target && (target.tier === "apps" || target.tier === "services")) {
      report(line, "monorepo-direction", `Package module imports downstream ${target.tier.slice(0, -1)} code ('${specifier}').`,
        "Move the shared code into packages/ (if it has two real consumers today) or invert the dependency with a port the app/service implements.");
    }
    if (from.role === "domain" && target?.role === "adapter") {
      report(line, "hexagonal-direction", `Domain module imports an adapter ('${specifier}').`,
        "Declare an outbound port in <Context>Ports named for the domain need; implement it in the adapter and bind it in <Context>Vertical.");
    }
    if (from.role === "domain" && !isRelative && IO_MODULES.test(specifier)) {
      report(line, "domain-purity", `Domain module imports I/O module '${specifier}'.`,
        "Keep *Rules pure (value in -> value out). Move the effect to <Context>Service behind a port, or to an adapter.");
    } else if (from.role === "domain" && !isRelative && !specifier.startsWith("node:") && !/(?:^|\/)model(?:\/|$)/.test(specifier)) {
      report(line, "domain-purity", `Domain module imports vendor package '${specifier}'.`,
        "Domain code imports only the standard library and packages/model. Translate vendor types at the adapter edge (Parse, Don't Validate).");
    }
  }

  if (from.role === "domain") {
    source.split("\n").forEach((text, index) => {
      for (const { pattern, what, fix } of IMPURE_CALLS) {
        if (pattern.test(text)) report(index + 1, "deterministic-domain", `Domain module reads ${what}.`, `${fix[0]?.toUpperCase()}${fix.slice(1)}; tests then use TestClock / fixed values.`);
      }
    });
  }
  return violations;
}

/** @param {Violation} v */
export function formatViolation(v) {
  return `❌ ${v.file}:${v.line} [${v.rule}] ${v.message}\n   REMEDIATION: ${v.remediation}`;
}

/** @param {string} root @param {string} dir @returns {string[]} */
function listSources(root, dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return SOURCE_EXT.test(dir) ? [dir] : [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) return [];
    return listSources(root, path.posix.join(dir, entry.name));
  });
}

function main(argv) {
  const root = process.cwd();
  const targets = argv.length > 0 ? argv.map((arg) => arg.replace(/\\/g, "/").replace(/\/$/, "")) : ["."];
  const files = targets.flatMap((target) => listSources(root, target)).map((file) => path.posix.normalize(file));
  const violations = files.flatMap((file) => lintSource(file, fs.readFileSync(path.join(root, file), "utf8")));
  for (const v of violations) console.error(formatViolation(v));
  if (violations.length > 0) {
    console.error(`\n[lint-architecture] ${violations.length} violation(s) in ${files.length} file(s). Fix the design; never weaken this linter to make a change fit.`);
    return 1;
  }
  console.log(`✅ [lint-architecture] ${files.length} file(s) respect the dependency direction.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
