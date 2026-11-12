// Always-on Pi adapter: one owner for gate evidence/strikes plus file/context guards.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  evaluateFileMutation, evaluatePlanModeShell, isFeatureListPath,
  localContextDirs, parseFileMutation, toRelativePath,
} from "../src/rules/guardrail-rules.ts";
import { evaluateMutationUnderStrikes, formatStrikeStatus, isDeterministicGateCommand } from "../src/rules/strike-rules.ts";
import { initialGateState, parseGateEvent, restoreStrikes, STRIKE_ENTRY, transitionGate } from "../src/rules/gate-evidence-rules.ts";
import { GATE_EVENT, GATE_QUERY, reportGate } from "./gate-runtime.ts";

const LOCAL_CONTEXT_FILE = "AGENTS.md";
function readIfExists(file: string): string | undefined {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
}

export default function (pi: ExtensionAPI) {
  let state = initialGateState({ kind: "haltedForHuman" });
  let currentCtx: ExtensionContext | undefined;
  const injectedContextDirs = new Set<string>();
  const showStatus = (ctx: ExtensionContext) => ctx.ui.setStatus("solo-sota", formatStrikeStatus(state.shift));
  const initialize = (ctx: ExtensionContext) => {
    if (!currentCtx) {
      state = initialGateState(restoreStrikes(ctx.sessionManager.getBranch()));
      injectedContextDirs.clear();
    }
    currentCtx = ctx;
    showStatus(ctx);
  };

  pi.events.on(GATE_QUERY, callback => {
    if (currentCtx && typeof callback === "function") callback(state);
  });
  pi.events.on(GATE_EVENT, value => {
    const event = parseGateEvent(value);
    if (!currentCtx || !event) return;
    const next = transitionGate(state, event);
    if (next.shift !== state.shift) pi.appendEntry(STRIKE_ENTRY, next.shift);
    state = next;
    if (currentCtx) showStatus(currentCtx);
  });

  pi.on("session_start", async (_event, ctx) => {
    currentCtx = undefined;
    initialize(ctx);
  });
  pi.on("session_tree", async (_event, ctx) => {
    currentCtx = undefined;
    initialize(ctx); // Branch-local strikes restore; evidence never follows tree navigation.
  });
  pi.on("session_shutdown", async () => {
    state = initialGateState(state.shift); // No pending or green proof survives session disposal.
    currentCtx = undefined;
  });
  pi.on("input", async (event, ctx) => {
    initialize(ctx);
    reportGate(pi, { kind: "input", source: event.source });
    return { action: "continue" };
  });

  pi.on("tool_call", async (event, ctx) => {
    initialize(ctx);
    if (event.toolName === "bash" || event.toolName === "powershell") {
      const command = event.input["command"];
      if (typeof command === "string" && isDeterministicGateCommand(command)) {
        reportGate(pi, { kind: "started", id: `tool:${event.toolCallId}`, purpose: { kind: "check" } });
      } else if (typeof command === "string" && !evaluatePlanModeShell(command).allowed) {
        reportGate(pi, { kind: "invalidated" });
      }
    }
    const mutation = parseFileMutation(event.toolName, event.input);
    if (!mutation) return undefined; // Shell/custom-tool mediation remains HARN-003.
    const relPath = toRelativePath(ctx.cwd, mutation.path);
    // Approval needs its proof at tool_call; its tool_result consumes that proof below.
    if (!isFeatureListPath(relPath)) reportGate(pi, { kind: "invalidated" });
    const strikeDecision = evaluateMutationUnderStrikes(state.shift);
    if (!strikeDecision.allowed) return { block: true, reason: strikeDecision.reason, terminate: true };
    const decision = evaluateFileMutation(relPath, mutation, readIfExists(path.resolve(ctx.cwd, relPath)));
    if (decision.allowed) return undefined;
    if (ctx.hasUI) ctx.ui.notify(decision.reason, "warning");
    return { block: true, reason: decision.reason };
  });

  pi.on("tool_result", async (event, ctx) => {
    initialize(ctx);
    if (event.toolName === "bash" || event.toolName === "powershell") {
      const command = event.input["command"];
      if (typeof command === "string" && isDeterministicGateCommand(command)) {
        reportGate(pi, { kind: "finished", id: `tool:${event.toolCallId}`, outcome: event.isError ? "fail" : "pass" });
        if (state.shift.kind === "haltedForHuman" && ctx.hasUI) {
          ctx.ui.notify("2-strike cap reached: file mutations are blocked until you steer the agent.", "error");
        }
      }
      return undefined;
    }
    if (event.toolName === "edit" || event.toolName === "write") reportGate(pi, { kind: "invalidated" });

    // LocalContextMiddleware: first tool result in a subtree receives nested instructions.
    const filePath = event.input["path"];
    if (typeof filePath !== "string" || !["read", "edit", "write"].includes(event.toolName)) return undefined;
    const additions = localContextDirs(toRelativePath(ctx.cwd, filePath))
      .filter(dir => !injectedContextDirs.has(dir))
      .flatMap(dir => {
        injectedContextDirs.add(dir);
        const text = readIfExists(path.join(ctx.cwd, dir, LOCAL_CONTEXT_FILE));
        return text === undefined ? [] : [{ type: "text" as const, text: `[Local context: ${dir}/${LOCAL_CONTEXT_FILE}]\n${text}` }];
      });
    return additions.length === 0 ? undefined : { content: [...event.content, ...additions] };
  });
}
