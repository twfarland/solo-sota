# Contributing

Solo-SOTA is an experimental TypeScript/Node-only Pi harness. Start with
[AGENTS.md](AGENTS.md), [the core rules](core/AGENTS.base.md),
[architecture](ARCHITECTURE.md), and [known limitations](ROADMAP.md).
The project uses the [MIT license](LICENSE). Preserve its copyright/permission
notice with copied harness assets; do not replace an application's own license.

## Local verification

Requires Node >=23.6 (Node 24 recommended), npm, Git and Bash. SDK tests use the
pinned Pi 1.5.2 dependency, with no provider credentials or LLM calls required.

```bash
npm ci
bash ./init.sh
```

Run the full gate before and after a change. It checks TypeScript, Node tests,
architecture, context symmetry, TODO diffs and Quint shallow behavior. Individual
commands live in `package.json`; `node --test` also exercises real-filesystem,
Git/CLI and real Pi SDK integration cases. Optional deep proof needs Java 17+
and downloads; document whether it actually ran.

GitHub CI runs the same gate plus `npm audit --audit-level=low` on Node 24 /
Ubuntu and Windows. Audit results depend on the current advisory service. Use Git Bash on
Windows. A hosted CI result is separate from a successful local run.

## Change discipline

- Write a failing deterministic test before new behavior or a bug fix.
- Put decisions in pure `src/rules/` functions; keep Pi/CLI/filesystem effects in
  thin adapters. Use real boundaries and hand-written recording/in-memory ports,
  never a mocking library. Self-fixtures follow the existing fragment convention.
- Preserve architecture sensors, guard semantics and invariants. Never weaken
  them, skip assertions or replace real checks with success stubs to land a patch.
- Keep scope small. Remove dead paths, avoid speculative abstractions, and update
  docs with behavior. Stateful mode/strike changes require model/companion sync.
- After two consecutive failing deterministic gates, stop mutations and ask for
  operator steering. Expected-red runs are not an excuse to bypass that rule.
- New comment markers use `TODO(owner): reason`; unchanged legacy debt is not a
  license to introduce more. See [the check boundaries](docs/checks.md).
- Append a handoff to `claude-progress.txt` with changes, evidence and next steps.
  Preserve historical entries. The seven bootstrap contracts are immutable history;
  do not rewrite them or self-approve feature pass flags.

## Proposing a change

Explain the problem, reproduction, intended boundary and test evidence. Include
relevant platform/Node/Pi versions. Keep transcripts and examples minimal and
sanitized: no credentials, private source, raw session archives or local settings.
For vulnerabilities, follow [the security policy](SECURITY.md), not a public issue.

Changes to runtime loading or installation should exercise real temporary projects,
conflict preservation and repeat safety. Changes to gate evidence need cancellation,
staleness and lifecycle coverage. Review [the adoption contract](docs/adoption.md)
before changing merge/backup behavior. Do not claim arbitrary shell mediation or
competitive performance from unit-test counts.

Before proposing a commit, run the anti-entropy review in
[the skill](skills/anti-entropy-review/SKILL.md) and `git diff --check`.
The maintainer reviews compatibility and scope; no support SLA is promised.
