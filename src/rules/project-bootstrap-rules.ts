// Pure decisions for creating a fresh TypeScript project, separate from installing into an existing repo.
import { harnessResources } from "./bootstrap-rules.ts";
type ProjectArgs =
  | { readonly kind: "help" }
  | { readonly kind: "error"; readonly reason: string }
  | { readonly kind: "create"; readonly target: string };

export function parseProjectArgs(args: readonly string[]): ProjectArgs {
  if (args.length === 1 && args[0] === "--help") return { kind: "help" };
  if (args.length === 2 && args[0] === "--target" && args[1]?.trim() && !args[1].startsWith("--")) {
    return { kind: "create", target: args[1] };
  }
  return { kind: "error", reason: "Expected --target <new-directory>. No force or overwrite option is supported." };
}

const json = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";

type ProjectFile = { readonly destination: string } & ({ readonly content: string } | { readonly source: string });

export function projectFiles(harnessRoot: string, projectName: string): ProjectFile[] {
  const name = projectName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 214) || "new-project";
  return [
    { destination: "package.json", content: json({
      name, version: "0.0.0", private: true, type: "module", engines: { node: ">=23.6" },
      scripts: { check: "bash ./init.sh", test: "vitest run", typecheck: "tsc --noEmit" },
      devDependencies: { "@informalsystems/quint": "0.33.1", "@types/node": "^24.0.0", typescript: "5.9.3", vitest: "^4.0.0" },
    }) },
    { destination: "tsconfig.json", content: json({
      compilerOptions: {
        target: "ES2023", module: "NodeNext", moduleResolution: "NodeNext", noEmit: true,
        allowImportingTsExtensions: true, strict: true, noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true, noImplicitReturns: true, noUnusedLocals: true,
        noUnusedParameters: true, skipLibCheck: true, types: ["node"],
      },
      include: ["src/**/*.ts", "tests/**/*.ts"],
    }) },
    { destination: ".pi/settings.json", content: json(harnessResources(harnessRoot)) },
    { destination: ".gitignore", content: "node_modules/\n.tmp/\ncoverage/\ndist/\nspec/traces/\n.env*\n.pi/settings.json\n.pi/mcp.json\n" },
    { destination: "tests/environment.test.ts", source: "overlays/ts-node/environment.test.ts.template" },
    { destination: "claude-progress.txt", content: "Project initialized with the Solo-SOTA harness. No application features defined yet.\n" },
    { destination: "README.md", content: PROJECT_README },
  ];
}

const PROJECT_README = `# New TypeScript project

Requires Node >=23.6, npm, Git, Bash and Pi. From this project directory:

\`\`\`bash
npm install
bash ./init.sh
pi
\`\`\`

Review and approve Pi's project trust prompt to load the harness. Confirm that
/init-harness, /plan, /shift and /qa appear. Project settings add to inherited
resources; review other enabled extensions. Trust and guards are not a sandbox.
Local .pi/settings.json references the shared harness checkout and is ignored by
Git. Keep that checkout available; configure your own paths on another machine.
Creation did not install dependencies, add remotes, stage files, make commits or
change global Pi settings.

The initial test checks the Node toolchain requirement, not application behavior.
Fill in ARCHITECTURE.md and establish your own operator-reviewed feature_list.json
before /shift or /qa. Use unique IDs, descriptions, string-array steps and boolean
passes values; do not copy the harness's completed bootstrap backlog. Add real
application tests with each feature. Append handoffs to claude-progress.txt.

Stateful flows need project-specific Quint models and companion Markdown files.
An empty spec directory is not formal evidence. See spec/README.md. Java 17+ is
only required for deep proof. Use separate worktrees and AGENT_IDs for concurrency.

After reviewing files and a green baseline, make your first Git commit yourself.
Never commit credentials. The harness MIT notice is in core/SOLO-SOTA-LICENSE;
it does not set the application's own license. Guidance and gates are snapshots;
shared runtime extensions update after a Pi reload. Merge guidance updates manually.
`;
