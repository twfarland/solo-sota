# Solo-SOTA

**A source-loaded Pi harness for disciplined solo TypeScript/Node development.**

Solo-SOTA adds mechanical guardrails, a Plan → Shift → QA workflow, architecture
checks and Quint formal-model gates to Pi. Keep one shared harness checkout and
use it across your application repositories—no full harness copy is required.

**Status: experimental, version 0.1.0.** The original seven bootstrap features
passed QA. Known enforcement gaps remain. This is **not an OS sandbox**, and no
independent benchmark establishes an advantage over vanilla Pi or Claude Code.
“SOTA” is the project name, not a demonstrated performance claim.

## Requirements and installation

Clone the repository and verify the checkout:

```bash
git clone https://github.com/twfarland/solo-sota.git
cd solo-sota
npm ci
bash ./init.sh
```

- **Node >=23.6** for native TypeScript stripping; Node 24 is the CI target.
- **Bash, npm and Git**; Windows users need Git Bash. Fresh-project creation needs Git 2.28+.
- **Pi SDK 1.5.2** is the tested integration version; use the corresponding Pi CLI. Install/configure the Pi CLI
  separately; the SDK devDependency does not activate the harness or authenticate a provider.
- **Java 17+** is needed only for optional deep Quint proof, not the normal gate.

The SDK upgrade resolves the previously reported dependency entries: the latest
verification found **zero npm audit findings**. This is a point-in-time result,
not a security guarantee; see [dependency audit status](SECURITY.md#dependency-audit-status).
Updating this checkout does not update your globally installed Pi CLI.

The package is intentionally private: use a checkout, not an assumed npm release.

## Quickstart: new project

Run from this checkout; the destination must not exist or be inside another Git repo:

```bash
npm run create-project -- --target ../my-project
cd ../my-project
npm install
bash ./init.sh
pi
```

This scaffolds strict TypeScript tooling, guidance, gates and local Pi resource
paths, and initializes Git on `main`. It does not stage, commit, add a remote or
install dependencies automatically. Approve Pi's project-trust prompt to load the
harness. The starter test checks the runtime requirement, not application behavior.

## Quickstart: existing Pi project

Preview first; apply only after reviewing the report:

```bash
# From the harness checkout:
npm run adopt-project -- --target /path/to/existing-project
npm run adopt-project -- --target /path/to/existing-project --apply
```

Adoption retains existing settings, instructions, tests, backlog and Git history;
backs up modified originals; and blocks conflicting harness assets. Existing
project gates are preserved, not certified. Reconcile the reported integration
items and run the project's baseline before using the workflow.
See [adoption and conflict handling](docs/adoption.md).

Both commands can run from elsewhere using `node /path/to/solo-sota/bin/<command>.mjs`
with the same arguments. Shared extension paths are machine-local; keep this
checkout available. Neither command changes global Pi settings or grants trust.

## Everyday workflow

In the application directory, after establishing its own architecture, tests and
operator-reviewed `feature_list.json`:

```text
/init-harness
/plan <goal>
/shift APP-001
/qa APP-001
```

Only green QA can approve the selected feature. The harness's completed bootstrap
backlog is history, **not** an application backlog or evidence that your app passes.
For a recurring mistake, use `/ratchet <mistake>`; for stateful flows, use
`/quint-sync <context>`, `/quint-check` and optionally `/quint-prove`.

Already loaded? `/reload` refreshes resources without discarding the conversation.
Use a fresh session when switching projects. See [runtime loading and recovery](docs/runtime.md).

## What the harness adds

| Mechanism | Purpose and boundary |
| --- | --- |
| File/content guards | Reject selected paths, mocking-library usage and malformed new TODO comments; not arbitrary OS effects |
| Plan / Shift / QA modes | Bound the intended workflow and selected-feature approval |
| Shared gate evidence | Revoke stale QA proof and account recognized checks/cancellation |
| Two-strike cap | Halt guarded mutations after two consecutive gate failures until real operator input |
| Architecture sensor | Check import direction and domain purity |
| Context symmetry | Check local outbound-contract filenames—not contract execution |
| Quint gates | Typecheck, test, simulate safety invariants and exercise teeth witnesses; bounded deep proof is separate |

See [checks and their limitations](docs/checks.md), [architecture](ARCHITECTURE.md)
and the [formal models](spec/README.md). Guards do not mediate every shell/custom-tool
path. Deferred HARN-003…005 findings in [the roadmap](ROADMAP.md) remain real.
Use disposable workspaces or an external isolation boundary for untrusted tasks,
keep credentials out of reach, and review patches independently.

## Documentation

- [Project setup and guidance-only installation](docs/setup.md)
- [Adopting an existing Pi setup](docs/adoption.md)
- [Runtime commands, sessions and gate evidence](docs/runtime.md)
- [TODO and contract-symmetry checks](docs/checks.md)
- [Contributing and verification](CONTRIBUTING.md)
- [Security and reporting](SECURITY.md)
- [Public-release checklist](docs/publishing.md)
- [Outer evaluation harness proposal](docs/evaluation.md)—design only, not implemented

For maintainers, [AGENTS.md](AGENTS.md) is the working map. `claude-progress.txt`
is the append-only development ledger. Old entries describe historical scope,
including retired stack support; only TypeScript/Node is distributed now.

## Verification and honest claims

```bash
bash ./init.sh          # Full local gate
node --test            # Unit, filesystem, CLI and real Pi SDK tests
npx tsc --noEmit
npm audit --audit-level=low
bash ./spec/scripts/check.sh
bash ./spec/scripts/prove.sh   # Optional deep proof; Java/downloads required
```

The normal gate includes typechecking, tests, architecture lint, symmetry, TODO
diff and Quint shallow checks. SDK tests make no provider requests. GitHub CI is
configured for Node 24 on Ubuntu and Windows, with a separate low-and-above
advisory gate; configured CI is not a claim that a
hosted run has already passed. Green mechanisms do not prove superior task outcomes,
complete mediation or exhaustive formal correctness. See the evaluation proposal.

## License

[MIT](LICENSE), copyright 2026 twfarland and contributors. Keep the copyright
and permission notice with copies or substantial portions. Setup/adoption copies
the harness notice to `core/SOLO-SOTA-LICENSE` without replacing the application's
own license. Dependencies retain their own licenses. The package remains private;
no npm publication is configured.
