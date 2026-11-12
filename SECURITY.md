# Security policy and boundaries

Solo-SOTA is experimental workflow tooling, **not a sandbox or complete security
boundary**. Pi, extensions and commands run with the operating-system permissions
of their process. A working directory, project-trust prompt or green gate does
not isolate credentials, files, processes or network services.

## Known limitations

[ROADMAP.md](ROADMAP.md) records concrete open findings, including:

- Shell/custom-tool mutation and nested/outside protected-path bypasses (HARN-003).
- Exact projected edit/JSON-contract compatibility gaps (HARN-004).
- A superseded QA completion replacing a newer mode and other lifecycle work
  (HARN-005).

Scoped fixes/tests exist for selected-feature authorization and stale gate
proof. They do not close every channel. Tests, shallow simulations and bounded
proofs establish only their modeled/asserted scope. There is no independent
penetration-test or competitive-performance certification.

## Dependency audit status

The project now pins Pi SDK **1.5.2**. After upgrading the SDK and regenerating
the lockfile, `npm audit --json` reports **zero findings at all severities**.
The real SDK integration and full functional gate pass with that version. No
forced upgrade, audit suppression or dependency override was used.

This is a point-in-time advisory result, not a guarantee of security. CI runs
`npm audit --audit-level=low` separately from the local functional gate; advisory
availability/data can change. The upgrade does not update a globally installed
Pi CLI or certify every environment using an older installation.

### Previous report (resolved by this dependency update)

Publication preparation initially reported **four affected package entries:
two high and two moderate**, all under the former Pi 1.0.0 dependency:

| Package entry | Reported severity | Example public advisory |
| --- | --- | --- |
| `brace-expansion` | High | [Recursion denial of service](https://github.com/advisories/GHSA-qhr7-859c-m2p7) |
| `minimatch` | Moderate | [Globparts amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249) |
| `undici` | High | [Dropped TLS options](https://github.com/advisories/GHSA-2m5v-pch6-74hx) |
| `@earendil-works/pi-coding-agent` | Moderate aggregate | Affected through its dependency chain |

Some package entries contain multiple advisories; this is not a claim of exactly
four distinct CVEs or of assessed exploit reachability. DevDependency placement
alone does not make loaded code harmless. Audit results change: rerun the audit.

Keep dependency changes compatibility-tested and re-run the audit instead of
assuming these historical counts describe the current lockfile. Advisory checks
and functional tests cover different risks; neither proves complete mediation.

## Safer operation

- Run untrusted tasks inside a suitable container, VM or other external isolation
  boundary. Expose only necessary files/services and narrowly scoped credentials.
- Review source-loaded extensions before granting project trust. Existing global
  resources, MCP servers, system prompts and packages may add effects or conflicts.
- Keep secrets out of sessions and version control. Ignore rules are preventive
  convenience, not a detector, and cannot untrack existing committed secrets.
- Snapshot/checkpoint before migration or generated changes. Inspect patches and
  the actual commands inside project verification gates independently.
- Treat configuration, source comments, task text and tool output as untrusted
  instructions. A guard blacklist cannot eliminate prompt injection.

## Reporting a vulnerability

Do **not** post credentials, a working exploit against a third party, private
source or sensitive transcripts in public issues or pull requests.

If the GitHub repository has private vulnerability reporting enabled, use
[Security → Report a vulnerability](https://github.com/twfarland/solo-sota/security/advisories/new).
The owner must enable this feature; its availability has not been verified here.
If no private channel is available, open only a request for a private contact
route, without vulnerability details. No maintainer email is invented by this
source checkout.

A useful private report includes affected revision, Node/Pi/OS versions, a minimal
sanitized reproduction, expected/observed behavior and the boundary crossed.
Use disposable fixtures, not real credentials or production targets.

No response-time guarantee or long-term support policy exists yet. The pinned
Pi SDK integration is 1.5.2; compatibility with other releases is not implied. Do not
interpret a public repository or bootstrap completion as production security approval.
