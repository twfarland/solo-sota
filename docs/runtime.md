# Runtime loading, workflow and recovery

Installing guidance or building the harness does not itself activate extensions.
The create/adopt commands configure project-local resources; the exact installer
only copies guidance/gates. Run Pi from the application directory for the correct
instructions, configuration and session grouping.

## Explicit source loading

From the harness checkout:

```bash
pi --no-extensions -e ./extensions/solo-sota-harness.ts \
  -e ./extensions/plan-quint-qa-modes.ts -e ./extensions/self-ratchet.ts \
  --skill ./skills
```

From another project (Git Bash):

```bash
HARNESS=/absolute/path/to/solo-sota
cd /absolute/path/to/your-project
pi --no-extensions \
  -e "$HARNESS/extensions/solo-sota-harness.ts" \
  -e "$HARNESS/extensions/plan-quint-qa-modes.ts" \
  -e "$HARNESS/extensions/self-ratchet.ts" \
  --skill "$HARNESS/skills"
```

On Windows, a path such as `HARNESS=C:/dev/solo-sota` works. No global Pi settings
change is needed. `--no-extensions` disables discovered and built-in extensions,
including MCP; explicit `-e` entries still load. Pi 1.5.2 also has `--no-mcp`,
but it disables only the built-in MCP support, not other discovered extensions.
Project-local resource settings, unlike this isolated recipe, add to inherited
resources. Review what else loads before dropping `--no-extensions`.

Load all three entry extensions together. The always-on owner must initialize
before the command/self-verification adapters can supply usable gate evidence.
Confirm the shield status and `/init-harness` in the command menu. Headless runs
need an appropriate explicit project-trust decision; installers never grant it.

## Sessions and commands

- `/reload` is Pi's built-in resource reload; it retains the conversation.
- If extensions were never loaded, relaunch with their paths. Add `--continue`
  to keep the latest session in the current directory.
- `/new` starts a conversation, not missing extension configuration.
- Use a fresh session when moving to another project.

| Harness command | Purpose |
| --- | --- |
| `/init-harness` | Run the project's `./init.sh` |
| `/plan <goal>` | Read-only exploration; write only its plan under `plans/` |
| `/shift [ID]` | Work on an existing selected feature; default first pending |
| `/qa [ID]` | Run the gate; review may approve only the selected feature |
| `/quint-sync <context>` | As-built model sync and bug hunt |
| `/quint-check` | Shallow model gate |
| `/quint-prove` | Confirm, then run deep proof |
| `/ratchet <mistake>` | Encode a recurring mistake as a permanent mechanical check |
| `/reload-harness` | Execute a queued self-verification reload; bare/stale requests refused |

A normal application loop is `/init-harness`, `/plan <goal>`, `/shift APP-001`,
`/qa APP-001`. Establish the project's own backlog and real gate first. All seven
bootstrap entries in this checkout are complete; bare `/shift` has no next item.

## Gate evidence and recovery

Recognized tool gates, slash-command gates and self-verification share one ledger.
QA approval requires a completed current run for the selected feature and exact
backlog snapshot. Later gates, observed mutations, mode/session/branch changes
and approval completion revoke it. An observed backlog mismatch cannot be undone
by restoring old text; run `/qa <ID>` again. Overlapping/cancelled runs cannot mint
fresh approval, and discarded completions cannot alter restored strikes or proof.

Two consecutive deterministic gate failures halt guarded mutations. Stop, explain
the evidence and obtain genuine operator steering; synthetic extension messages
cannot clear the halt. Strikes follow the active Pi session branch across reload;
green proof never persists. This is not a global lock across unrelated sessions
or Git branches. Known shell/custom-tool bypasses remain in the roadmap.

The `verify_and_reload_harness` tool queues `/reload-harness` only after current
successful verification. The queued command rechecks proof and cancellation,
including cancellation after queuing. It does not turn a bare reload into a gate.
SDK hosts that omit reload startup notifications receive no gate state until a
real tool/input context restores their branch. Bound and unbound hosts are tested.

Recording-port and real Pi SDK tests exercise actual shell/edit hooks, cancellation,
approval, recovery and reload without provider requests. These do not certify
arbitrary project scripts or OS effects. See [the security policy](../SECURITY.md)
and [deferred findings](../ROADMAP.md) before making enforcement claims.
