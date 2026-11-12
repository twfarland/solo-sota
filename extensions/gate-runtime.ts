// Effect adapter shared by command gates, self-verification and the always-on owner.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  executionOutcome, gateIsVerified,
  type GateEvent, type GatePurpose, type GateState,
} from "../src/rules/gate-evidence-rules.ts";

export const GATE_EVENT = "solo-sota:gate-event:v1";
export const GATE_QUERY = "solo-sota:gate-query:v1";

export function reportGate(pi: ExtensionAPI, event: GateEvent): void {
  pi.events.emit(GATE_EVENT, event);
}

export function currentGateState(pi: ExtensionAPI): GateState {
  let state: GateState | undefined;
  // Pi's bus invokes synchronous handlers immediately. No owner means fail closed.
  pi.events.emit(GATE_QUERY, (current: GateState) => { state = current; });
  if (!state) throw new Error("Solo-SOTA gate owner unavailable; load solo-sota-harness.ts before running gated commands.");
  return state;
}

export async function runGate(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  args: string[],
  purpose: GatePurpose = { kind: "check" },
  signal: AbortSignal | undefined = ctx.signal,
) {
  currentGateState(pi); // Never execute a check whose result would go unaccounted.
  const id = Symbol(args.join(" ")); // Runtime-local identity, no counter collisions after reload.
  reportGate(pi, { kind: "started", id, purpose });
  if (signal?.aborted) {
    reportGate(pi, { kind: "finished", id, outcome: "fail" });
    return { stdout: "", stderr: "Gate cancelled before execution.", code: 1, killed: true, id, verified: false };
  }
  try {
    const result = await pi.exec("bash", args, { cwd: ctx.cwd, signal });
    const outcome = executionOutcome(result, signal?.aborted === true);
    reportGate(pi, { kind: "finished", id, outcome });
    return { ...result, id, verified: outcome === "pass" && gateIsVerified(currentGateState(pi), id) };
  } catch (error) {
    reportGate(pi, { kind: "finished", id, outcome: "fail" });
    throw error;
  }
}
