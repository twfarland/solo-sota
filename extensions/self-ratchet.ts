// extensions/self-ratchet.ts
// Self-improvement: /ratchet turns an observed mistake into a permanent mechanical rule;
// verify_and_reload_harness runs ./init.sh and, only when green, queues /reload-harness (ctx.reload()).
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { verificationCanReload, type GateId } from "../src/rules/gate-evidence-rules.ts";
import { currentGateState, reportGate, runGate } from "./gate-runtime.ts";

const OUTPUT_TAIL = 2500;

export default function (pi: ExtensionAPI) {
  let reload: { readonly id: GateId; readonly signal: AbortSignal | undefined } | undefined;
  // Tools receive ExtensionContext (no reload), so the tool queues this command after verification.
  pi.registerCommand("reload-harness", {
    description: "Hot-reload harness extensions, skills, and prompts (ctx.reload())",
    handler: async (_args, ctx) => {
      if (reload === undefined || !verificationCanReload(currentGateState(pi), reload.id, reload.signal?.aborted === true)) {
        reload = undefined;
        ctx.ui.notify("Reload blocked: run fresh self-verification first; stale, cancelled or halted verification cannot reload.", "warning");
        return;
      }
      reload = undefined;
      reportGate(pi, { kind: "invalidated" });
      await ctx.reload();
    },
  });

  pi.registerTool({
    name: "verify_and_reload_harness",
    label: "Verify & Hot-Reload Harness",
    description: "Runs harness unit tests and Quint shallow checks (./init.sh); hot-reloads Pi extensions only if they pass.",
    parameters: Type.Object({
      summaryOfChange: Type.String({ description: "What harness rule, skill, or extension was improved" }),
    }),
    promptSnippet: "Verify harness unit/Quint tests and hot-reload runtime extensions",
    promptGuidelines: [
      "Use verify_and_reload_harness after modifying any file in src/rules/, extensions/, skills/, or spec/ to verify tests pass before reloading.",
    ],
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: "Running harness self-test suite and Quint shallow gate..." }], details: undefined });
      reload = undefined;
      const verificationSignal = signal ?? ctx.signal;
      const check = await runGate(pi, ctx, ["./init.sh"], { kind: "check" }, verificationSignal);
      if (!check.verified || !verificationCanReload(currentGateState(pi), check.id, verificationSignal?.aborted === true)) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Self-verification failed. Harness was NOT reloaded. Fix errors first:\n${`${check.stdout}\n${check.stderr}`.trim().slice(-OUTPUT_TAIL)}`,
            },
          ],
          isError: true,
          details: { verified: false },
        };
      }
      reload = { id: check.id, signal: verificationSignal };
      pi.sendUserMessage("/reload-harness", { deliverAs: "followUp" });
      return {
        content: [{ type: "text", text: `✅ Harness self-tests and Quint model passed for: ${params.summaryOfChange}. Queued /reload-harness.` }],
        details: { verified: true, summary: params.summaryOfChange },
      };
    },
  });

  // /ratchet <observed failure mode>: Turns any recurring agent mistake into a permanent mechanical rule
  pi.registerCommand("ratchet", {
    description: "Self-improve the harness: turn an observed mistake into a mechanical rule, unit test, or negative skill example",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        ctx.ui.notify("Usage: /ratchet <describe the mistake or architectural drift to prevent permanently>", "info");
        return;
      }
      pi.setThinkingLevel("high");
      ctx.ui.setStatus("mode", "🔧 MODE: HARNESS RATCHET");

      pi.sendUserMessage(
        `[HARNESS SELF-IMPROVEMENT RATCHET]: The operator observed the following failure mode or drift:\n` +
          `"${args.trim()}"\n\n` +
          `Apply the Ratchet Principle ("the harness only tightens, never loosens"):\n` +
          `1. Decide the cheapest deterministic layer that prevents this error permanently:\n` +
          `   - Pure path/content guard in 'src/rules/guardrail-rules.ts' + failing-then-passing test in 'src/rules/guardrail-rules.test.ts'\n` +
          `   - Stack ArchitectureTest / linter rule in 'overlays/' with an explicit remediation message\n` +
          `   - Negative example in the relevant 'skills/*/SKILL.md' file\n` +
          `   - State invariant in 'spec/harness_lifecycle.qnt'\n` +
          `2. Implement the check and its unit test (write the test first and watch it fail).\n` +
          `3. Call 'verify_and_reload_harness' to run './init.sh' (unit tests + Quint check), then commit the harness upgrade.`,
      );
    },
  });
}
