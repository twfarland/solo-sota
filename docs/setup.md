# Project setup

Run setup commands from the shared harness checkout after `npm ci`. Requires
Node >=23.6, npm, Git and Bash; install/configure Pi 1.5.2 separately.
Windows examples use Git Bash and paths such as `C:/dev/solo-sota`.

## New project

```bash
npm run create-project -- --target ../my-project
cd ../my-project
npm install
bash ./init.sh
pi
```

The destination must not exist, even as an empty directory, and must be outside
an existing Git repository. Relative paths use the invoking directory. Quote
spaces. Linked/non-directory ancestors are refused. Git 2.28+ is required.

Creation installs strict TypeScript/ES-module configuration, declared local
TypeScript/Vitest/Quint dependencies, a Node runtime contract test, guidance,
gates, a handoff ledger, ignore rules and local Pi settings. Git starts on `main`
with empty templates. No dependency installation, staging, commit, remote,
identity, global setting or trust change occurs automatically.

The test checks the Node requirement only. No application source, application
acceptance criteria or application-specific formal model is invented.

## Existing Pi project

Use [the adoption command](adoption.md): read-only preview, then explicit
`--apply`. It merges runtime paths and guidance with backups, preserves
project-owned gates/docs, and refuses conflicting harness assets. It does not
replace your test runner, dependencies or backlog.

## Guidance-only installation

For an exact install without configuring Pi resources or merging existing files:

```bash
node ./bin/apply-harness.mjs --stack ts-node --target /path/to/repo
```

Only `ts-node` is accepted. The destination may exist or be absent. This copies:

- Core guidance and the TypeScript overlay; rendered root `AGENTS.md`.
- The MIT notice at `core/SOLO-SOTA-LICENSE`; an application's own license is untouched.
- An `ARCHITECTURE.md` template and `scripts/lint-architecture.mjs`.
- `init.sh`, `spec/scripts/check.sh`, `spec/scripts/prove.sh`, and a model README.

Identical files are untouched. Differing destinations, non-directory parents or
links are rejected before predictable writes. There is no force flag: preserve
existing files and merge deliberately. This command does not initialize Git,
install dependencies, configure Pi, copy a backlog or create formal models.

## Configure the application

1. Fill in the architecture map for the actual project.
2. Install TypeScript and Vitest devDependencies for the default generated gate,
   or deliberately integrate your existing runner without weakening its checks.
3. Make `quint` available on PATH or install `@informalsystems/quint` locally.
4. Add project-specific `.qnt` models and companion Markdown for stateful flows.
   Empty specs are permitted, but are not formal evidence. Java 17+ is needed
   only for optional deep proof; see the installed `spec/README.md`.
5. Establish the application's own reviewed `feature_list.json` before `/shift`.
   Never copy the completed harness bootstrap list. The initial contract is
   operator-owned; subsequent descriptions/steps are immutable. Example shape:

```json
[
  {
    "id": "APP-001",
    "description": "Add the agreed health endpoint",
    "steps": [
      "GET /health returns HTTP 200 and the agreed JSON body",
      "Deterministic tests cover that response"
    ],
    "passes": false
  }
]
```

Replace this example with your real acceptance criteria before establishing the
contract. IDs must be unique, descriptions strings, steps string arrays and
passes booleans. Only current green QA approves the selected existing feature.

Run `AGENT_ID=shift1 bash ./init.sh` in the target. Use separate worktrees and
unique agent IDs for parallel runs; the default report ID is `default`.
Generated gates run compiler, tests, architecture and Quint as separate fail-fast
commands. A custom project gate must propagate every required stage's failure.

## Runtime and updates

New-project/adoption settings reference the shared checkout. Approve project
trust, confirm the harness commands/status, then follow [the runtime guide](runtime.md).
Guidance-only installs need explicit resource loading from that guide.

Installed guidance/gates are snapshots, while source-loaded extensions use the
shared checkout after reload. Keep it available. On another machine, configure
its own paths; machine-local settings are not a portable package lock. Review
runtime upgrades and manually merge installed guidance instead of overwriting it.

None of the setup commands is a transaction or concurrency boundary. Run one
installer at a time. An infrastructure failure after creation can leave partial
output; inspect it manually. No force flag or automatic rollback/deletion exists.
The symmetry/TODO CLI checkers remain checkout-local; they are not silently
included in generated target gates. See [the checks guide](checks.md).
