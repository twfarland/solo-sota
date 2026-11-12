# Proposed independent outer evaluation harness

**Status: design only.** No benchmark runner, `bench` command, results dataset or
measured advantage over vanilla Pi/Claude Code is implemented in this repository.
The unit/SDK/CLI tests verify mechanisms, not coding-agent fitness.

## Separation of responsibility

An outer evaluator should own task contracts, execution isolation/limits,
independent acceptance tests, evidence capture and paired comparisons. Solo-SOTA,
vanilla Pi and Claude Code are candidates inside it. A candidate must not control
its own verdict, hidden tests or evaluation bookkeeping.

The intended home is a separate small repository, not another Solo-SOTA mode.
Candidate adapters should launch each tool in its native workflow, provide the
same task and collect outputs—not impose Plan → Shift → QA on every competitor.

## Pilot design

Start with 10 held-out real TypeScript tasks, three candidate configurations and
two independent runs each: 60 runs. Include diagnosis, features, brownfield
preservation, adapters/contracts and stateful flows. Do not curate only tasks
that reward our architecture preferences or reuse this completed bootstrap list.

Freeze the starting commit, request, independent acceptance criteria, hidden edge
checks, review rubric, time/tool/spend limits and human-assistance policy first.
Use isolated disposable workspaces without unnecessary secrets. Keep evaluator
checks outside the candidate's writable environment; verify patches afterward in
a clean workspace. Preserve failed, cancelled, timed-out and abandoned runs.

Match model version/thinking budget where possible. If not, call the result a
comparison of complete products, not evidence isolating harness quality. Randomize
run order, use comparable environment/cache conditions, and review patches without
candidate labels when practical. Ten tasks give directional evidence, not a
statistically definitive leaderboard. Later ablate instructions/skills versus
mechanical extensions to identify what earns its complexity.

## Fitness and decision criteria

Primary measure: **independently accepted tasks per operator-hour**, including
setup, clarification, recovery, review, repair and harness maintenance.

Also report verified/hands-off completion, elapsed time to acceptance, regressions,
false completion, review findings, unrelated complexity, interventions, usage and
cost. Keep subscription economics distinct from nominal API token costs. Avoid
one composite score that hides harmful failures or an automatic small-diff reward.

Test safety/false positives separately in disposable adversarial fixtures:
contract edits, stale approval, post-halt mutation, shell/custom-tool bypasses,
conflicting configuration and lifecycle/cancellation races. Include known open
findings. Neither these checks nor productive task outcomes prove a sandbox.

Keep mechanisms that improve accepted outcomes or reduce review/repair; simplify
those whose benefit comes from guidance alone; redesign ones that mostly cause
interruptions. Publish all run denominators and uncertainty, not selected wins.
