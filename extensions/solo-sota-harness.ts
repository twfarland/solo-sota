// extensions/solo-sota-harness.ts
// Thin Pi adapter: reads files and session events, delegates every decision to src/rules/*.
// Hooks: path/content/feature-list guards, 2-strike cap, LocalContextMiddleware, status bar.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { evaluateFileMutation, localContextDirs, parseFileMutation, toRelativePath } from "../src/rules/guardrail-rules.ts";
import {
  INITIAL_SHIFT,
  evaluateMutationUnderStrikes,
  formatStrikeStatus,
  isDeterministicGateCommand,
  recordGateOutcome,
  type ShiftState,
} from "../src/rules/strike-rules.ts";

const STATUS_KEY = "solo-sota";
const LOCAL_CONTEXT_FILE = "AGENTS.md";

function readIfExists(file: string): string | undefined {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
}

export default function (pi: ExtensionAPI) {
  let shift: ShiftState = INITIAL_SHIFT;
  const injectedContextDirs = new Set<string>();

  const showStatus = (ctx: ExtensionContext) => ctx.ui.setStatus(STATUS_KEY, formatStrikeStatus(shift));

  pi.on("session_start", async (_event, ctx) => {
    shift = INITIAL_SHIFT;
    injectedContextDirs.clear();
    showStatus(ctx);
  });

  // Human steering is the only exit from HaltedForHuman (spec/harness_lifecycle.qnt: startShift).
  pi.on("input", async (event, ctx) => {
    if (event.source !== "extension" && shift.kind === "haltedForHuman") {
      shift = INITIAL_SHIFT;
      showStatus(ctx);
    }
    return { action: "continue" };
  });

  pi.on("tool_call", async (event, ctx) => {
    const mutation = parseFileMutation(event.toolName, event.input);
    if (!mutation) return undefined;

    const strikeDecision = evaluateMutationUnderStrikes(shift);
    if (!strikeDecision.allowed) return { block: true, reason: strikeDecision.reason, terminate: true };

    const relPath = toRelativePath(ctx.cwd, mutation.path);
    const decision = evaluateFileMutation(relPath, mutation, readIfExists(path.resolve(ctx.cwd, relPath)));
    if (decision.allowed) return undefined;
    if (ctx.hasUI) ctx.ui.notify(decision.reason, "warning");
    return { block: true, reason: decision.reason };
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName === "bash") {
      const command = event.input["command"];
      if (typeof command === "string" && isDeterministicGateCommand(command)) {
        shift = recordGateOutcome(shift, event.isError ? "fail" : "pass");
        showStatus(ctx);
        if (shift.kind === "haltedForHuman" && ctx.hasUI) {
          ctx.ui.notify("2-strike cap reached: file mutations are blocked until you steer the agent.", "error");
        }
      }
      return undefined;
    }

    // LocalContextMiddleware: surface nested AGENTS.md files the first time the agent touches their subtree.
    const filePath = event.input["path"];
    if (typeof filePath !== "string" || !["read", "edit", "write"].includes(event.toolName)) return undefined;
    const additions = localContextDirs(toRelativePath(ctx.cwd, filePath))
      .filter((dir) => !injectedContextDirs.has(dir))
      .flatMap((dir) => {
        injectedContextDirs.add(dir);
        const text = readIfExists(path.join(ctx.cwd, dir, LOCAL_CONTEXT_FILE));
        return text === undefined ? [] : [{ type: "text" as const, text: `[Local context: ${dir}/${LOCAL_CONTEXT_FILE}]\n${text}` }];
      });
    return additions.length === 0 ? undefined : { content: [...event.content, ...additions] };
  });
}
