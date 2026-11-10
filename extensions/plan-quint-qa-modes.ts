// extensions/plan-quint-qa-modes.ts
// Harness statechart: /init-harness, /plan, /shift, /quint-sync, /quint-check, /quint-prove, /qa.
// Thin adapter: every gating decision lives in src/rules/harness-mode-rules.ts.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { applyEdits, isArchitectureSensorPath, parseFileMutation, toRelativePath } from "../src/rules/guardrail-rules.ts";
import {
  evaluateModeToolCall,
  formatModeStatus,
  parseFeatureList,
  planFileFor,
  selectFeature,
  type Feature,
  type HarnessMode,
  type ModeToolCall,
} from "../src/rules/harness-mode-rules.ts";

const STATUS_KEY = "mode";
const READ_ONLY_TOOLS = ["read", "bash", "grep", "find", "ls"];
const PLAN_TOOLS = [...READ_ONLY_TOOLS, "write", "edit"];
const BUILD_TOOLS = [...READ_ONLY_TOOLS, "write", "edit"];
const QA_TOOLS = [...READ_ONLY_TOOLS, "edit"];
const OUTPUT_TAIL = 3000;

const tail = (res: { stdout: string; stderr: string }) => `${res.stdout}\n${res.stderr}`.trim().slice(-OUTPUT_TAIL);

function readIfExists(file: string): string | undefined {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
}

function loadFeatures(cwd: string): Feature[] {
  return parseFeatureList(readIfExists(path.join(cwd, "feature_list.json")) ?? "") ?? [];
}

function toModeToolCall(toolName: string, input: Record<string, unknown>, cwd: string): ModeToolCall | undefined {
  if (toolName === "bash" || toolName === "powershell") {
    const command = input["command"];
    return typeof command === "string" ? { kind: "shell", command } : undefined;
  }
  const mutation = parseFileMutation(toolName, input);
  if (!mutation) return undefined;
  const relPath = toRelativePath(cwd, mutation.path);
  const currentText = readIfExists(path.resolve(cwd, relPath));
  const nextText = mutation.kind === "write" ? mutation.content : applyEdits(currentText ?? "", mutation.edits);
  return { kind: "fileMutation", relPath, currentText, nextText };
}

export default function (pi: ExtensionAPI) {
  let mode: HarnessMode = { kind: "normal" };

  const enter = (next: HarnessMode, ctx: ExtensionContext, tools: string[]) => {
    mode = next;
    pi.setActiveTools(tools);
    ctx.ui.setStatus(STATUS_KEY, formatModeStatus(mode));
  };

  pi.on("session_start", async (_event, ctx) => {
    mode = { kind: "normal" };
    ctx.ui.setStatus(STATUS_KEY, formatModeStatus(mode));
  });

  pi.on("tool_call", async (event, ctx) => {
    const call = toModeToolCall(event.toolName, event.input, ctx.cwd);
    if (!call) return undefined;

    // Never weaken ArchitectureTest / lint-architecture to make a change fit without explicit operator approval.
    if (call.kind === "fileMutation" && isArchitectureSensorPath(call.relPath)) {
      const approved =
        ctx.hasUI &&
        (await ctx.ui.confirm(
          "Architecture Sensor Guard",
          `Agent is attempting to modify '${call.relPath}'. Per guardrails: "Never weaken ArchitectureTest to make a change fit." Allow this edit?`,
        ));
      if (!approved) {
        return { block: true, reason: "BLOCKED: Never weaken ArchitectureTest to make a change fit. Change the domain/adapter design instead." };
      }
    }

    const decision = evaluateModeToolCall(mode, call);
    return decision.allowed ? undefined : { block: true, reason: decision.reason };
  });

  pi.registerCommand("init-harness", {
    description: "Run ./init.sh (typecheck, node --test, architecture lint, Quint shallow gate) and hand failures to the agent",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Running bash ./init.sh ...", "info");
      const res = await pi.exec("bash", ["./init.sh"], { cwd: ctx.cwd });
      if (res.code === 0) {
        ctx.ui.notify("✅ Harness baseline is green.", "info");
        return;
      }
      pi.sendUserMessage(
        `[HARNESS BASELINE FAILURE]: 'bash ./init.sh' exited ${res.code}:\n\`\`\`\n${tail(res)}\n\`\`\`\n` +
          `Restore the baseline before any feature work. Start from a failing deterministic test at the lowest layer.`,
      );
    },
  });

  pi.registerCommand("plan", {
    description: "Read-only planning pass: explore and write a single plan file (plans/<goal>.md)",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        ctx.ui.notify("Usage: /plan <goal>", "info");
        return;
      }
      const planFile = planFileFor(args);
      enter({ kind: "plan", planFile }, ctx, PLAN_TOOLS);
      pi.setThinkingLevel("high");
      pi.sendUserMessage(
        `[PLAN MODE — READ ONLY]: Goal: "${args.trim()}".\n` +
          `Read ARCHITECTURE.md, AGENTS.md, feature_list.json and the relevant code. Do not modify anything except '${planFile}'.\n` +
          `Write '${planFile}' with: affected bounded contexts, the Aggregate/Rules/Ports/Service shape, the deterministic tests to write first, ` +
          `any spec/*.qnt invariants to add, and the exact verification commands. Keep it short; this pass should take few turns.`,
      );
    },
  });

  pi.registerCommand("shift", {
    description: "Execute one feature from feature_list.json end-to-end (defaults to the first pending feature)",
    handler: async (args, ctx) => {
      const feature = selectFeature(loadFeatures(ctx.cwd), args);
      if (!feature) {
        ctx.ui.notify(args.trim() ? `No feature '${args.trim()}' in feature_list.json.` : "All features pass. Nothing to shift.", "info");
        return;
      }
      enter({ kind: "shift", featureId: feature.id }, ctx, BUILD_TOOLS);
      pi.setThinkingLevel("medium");
      pi.sendUserMessage(
        `[SHIFT ${feature.id}]: ${feature.description}\n` +
          `1. Read claude-progress.txt, AGENTS.md and the feature's steps in feature_list.json.\n` +
          `2. Write the failing deterministic test first, then implement within the guardrails.\n` +
          `3. Run 'bash ./init.sh' until green (the 2-strike cap halts you after two consecutive gate failures).\n` +
          `4. Append a short handoff entry to claude-progress.txt. Do NOT set "passes": true — only /qa may do that.`,
      );
    },
  });

  // /quint-sync <context-name>: Runs the 6-step Quint as-built sync & bug hunting loop
  pi.registerCommand("quint-sync", {
    description: "Sync spec/<context>.qnt with as-built code, run shallow check, and write failing tests for any violations",
    handler: async (args, ctx) => {
      const target = args.trim() || "model";
      enter({ kind: "quint", target }, ctx, BUILD_TOOLS);
      pi.setThinkingLevel("high");
      pi.sendUserMessage(
        `[QUINT AS-BUILT SYNC LOOP]: Target context/flow: "${args.trim() || "active state machine"}".\n` +
          `Follow the 6-step Quint protocol from 'skills/quint-formal-modeling/SKILL.md':\n` +
          `1. Read the as-built '<Aggregate>.kt/.ts' and '<Aggregate>Rules.kt/.ts' (or state transitions) and sync 'spec/${target}.md' and 'spec/${target}.qnt'.\n` +
          `2. Run shallow verification: 'bash ./spec/scripts/check.sh' (typecheck + unit tests + 200-sample simulator).\n` +
          `3. If an invariant fails, inspect the ITF trace in 'spec/traces/', write a deterministic failing test at the lowest layer (using InMemory* fake and TestClock), fix the code until green, and re-sync the Quint model.`,
      );
    },
  });

  // /quint-check: Fast shallow check (zero LLM overhead if it passes)
  pi.registerCommand("quint-check", {
    description: "Run fast shallow Quint check (typecheck + test + simulator)",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Running shallow Quint check (spec/scripts/check.sh)...", "info");
      const res = await pi.exec("bash", ["./spec/scripts/check.sh"], { cwd: ctx.cwd });
      if (res.code === 0) {
        ctx.ui.notify("✅ Quint shallow check passed!", "info");
        return;
      }
      ctx.ui.notify("❌ Quint shallow check found an issue. Dispatching trace to agent...", "error");
      pi.sendUserMessage(
        `[QUINT SHALLOW GATE FAILURE]: 'bash ./spec/scripts/check.sh' failed:\n\`\`\`\n${tail(res)}\n\`\`\`\n` +
          `Write a deterministic unit/contract test reproducing this trace before fixing the code.`,
      );
    },
  });

  // /quint-prove: Deep exhaustive model checking before production releases
  pi.registerCommand("quint-prove", {
    description: "Run deep exhaustive Quint formal verification (Apalache/TLC + teeth probes) for pre-release signoff",
    handler: async (_args, ctx) => {
      const ok = await ctx.ui.confirm("Run Deep Quint Proof?", "This runs exhaustive model checking (quint verify) which is compute-intensive. Proceed?");
      if (!ok) return;
      ctx.ui.notify("🔒 Running exhaustive Quint model checker (spec/scripts/prove.sh)...", "info");
      const res = await pi.exec("bash", ["./spec/scripts/prove.sh"], { cwd: ctx.cwd });
      if (res.code === 0) {
        ctx.ui.notify("✅ Full Quint formal proof and teeth probes succeeded!", "info");
        return;
      }
      pi.sendUserMessage(
        `[QUINT DEEP PROOF COUNTEREXAMPLE]: 'bash ./spec/scripts/prove.sh' found a violation:\n\`\`\`\n${tail(res)}\n\`\`\`\n` +
          `Inspect the generated '.itf.json' trace in 'spec/traces/', write a deterministic failing test at the lowest layer, fix the domain rule, and re-run check.sh.`,
      );
    },
  });

  pi.registerCommand("qa", {
    description: "Adversarial QA pass: re-run the deterministic gate, verify feature steps, and only then mark the feature passing",
    handler: async (args, ctx) => {
      const featureId = selectFeature(loadFeatures(ctx.cwd), args || (mode.kind === "shift" ? (mode.featureId ?? "") : ""))?.id;
      ctx.ui.notify("QA: running bash ./init.sh before evaluation...", "info");
      const res = await pi.exec("bash", ["./init.sh"], { cwd: ctx.cwd });
      const checksGreen = res.code === 0;
      enter({ kind: "qa", featureId, checksGreen }, ctx, QA_TOOLS);
      if (!checksGreen) {
        pi.sendUserMessage(
          `[QA REJECTED — GATE RED]: 'bash ./init.sh' exited ${res.code}:\n\`\`\`\n${tail(res)}\n\`\`\`\n` +
            `Do not mark anything passing. Summarise the failure; the operator will /shift ${featureId ?? ""} to fix it.`,
        );
        return;
      }
      pi.setThinkingLevel("high");
      pi.sendUserMessage(
        `[QA ${featureId ?? "(no pending feature)"} — GATE GREEN]: Act as an adversarial reviewer.\n` +
          `1. For each step of ${featureId ?? "the feature"} in feature_list.json, gather concrete evidence (run the command, read the file).\n` +
          `2. Apply skills/anti-entropy-review/SKILL.md to the shift's diff ('git diff' / 'git status').\n` +
          `3. Only if every step is proven, edit feature_list.json to flip that feature's "passes" to true — nothing else.\n` +
          `4. Otherwise list the failing steps and stop; the operator will /shift again.`,
      );
    },
  });
}
