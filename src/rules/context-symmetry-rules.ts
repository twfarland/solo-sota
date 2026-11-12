// Pure filename-inventory check, not an AST or test-execution verifier.
import * as path from "node:path";

type SymmetryFinding = { readonly path: string; readonly message: string };
const OUTBOUND_DIRS = new Set(["postgres", "adapters", "outbound"]);
const TEST_DIRS = new Set(["test", "tests", "__tests__"]);
const SOURCE = /\.(?:[cm]?ts|tsx)$/;
const CONTRACT = /Contract(?:Test|\.test|\.spec)?\.(?:[cm]?ts|tsx)$/;
const TEST_FILE = /(?:Contract(?:Test)?|Test|\.(?:test|spec))\.(?:[cm]?ts|tsx)$/;

function isOutboundAdapter(relative: string): boolean {
  const parts = relative.split("/");
  return OUTBOUND_DIRS.has(parts[0] ?? "") && SOURCE.test(relative) && !TEST_FILE.test(relative) &&
    !parts.some(part => TEST_DIRS.has(part));
}

function isLocalContract(relative: string): boolean {
  const parts = relative.split("/");
  return CONTRACT.test(path.posix.basename(relative)) &&
    (parts.length === 1 || TEST_DIRS.has(parts[0] ?? "") || OUTBOUND_DIRS.has(parts[0] ?? ""));
}

export function checkContextSymmetry(inventory: readonly string[]): SymmetryFinding[] {
  const files = [...new Set(inventory.map(file => path.posix.normalize(file.replaceAll("\\", "/"))))].sort();
  return files.flatMap(file => {
    const match = path.posix.basename(file).match(/^(.+)Ports\.([cm]?ts|tsx)$/);
    const stem = match?.[1];
    const extension = match?.[2];
    if (!stem || !extension) return [];
    const context = path.posix.dirname(file);
    const prefix = context === "." ? "" : `${context}/`;
    const siblings = files.filter(candidate => candidate.startsWith(prefix)).map(candidate => candidate.slice(prefix.length));
    const adapter = siblings.find(isOutboundAdapter);
    if (!adapter || siblings.some(isLocalContract)) return [];
    const suffix = `Contract.test.${extension}`;
    return [{ path: file, message: `Outbound ports and adapter '${prefix}${adapter}' need a contract suite. ` +
      `Add '${prefix}${stem}${suffix}' (or a sibling *Contract suite named for the port), ` +
      "and run it against both the InMemory fake and the real adapter." }];
  });
}
