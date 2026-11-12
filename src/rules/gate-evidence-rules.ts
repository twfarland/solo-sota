// Pure verification ledger. One run, one receipt, no clock or filesystem assumptions.
import { INITIAL_SHIFT, recordGateOutcome, type GateOutcome, type ShiftState } from "./strike-rules.ts";

export const STRIKE_ENTRY = "solo-sota:strikes:v1";
export type GateId = string | symbol;
export type GatePurpose = { readonly kind: "check" } |
  { readonly kind: "qa"; readonly featureId: string; readonly featureListText: string };
type PendingGate = { readonly id: GateId; readonly revision: number; readonly purpose: GatePurpose };
type Evidence = { readonly kind: "none" } |
  { readonly kind: "green"; readonly id: GateId; readonly revision: number; readonly purpose: GatePurpose };
export type GateState = {
  readonly shift: ShiftState;
  readonly revision: number;
  readonly pending: readonly PendingGate[];
  readonly completed: readonly GateId[];
  readonly evidence: Evidence;
};
export type GateEvent =
  | { readonly kind: "started"; readonly id: GateId; readonly purpose: GatePurpose }
  | { readonly kind: "finished"; readonly id: GateId; readonly outcome: GateOutcome }
  | { readonly kind: "invalidated" }
  | { readonly kind: "input"; readonly source: string };

export function initialGateState(shift: ShiftState = INITIAL_SHIFT): GateState {
  return { shift, revision: 0, pending: [], completed: [], evidence: { kind: "none" } };
}

export function transitionGate(state: GateState, event: GateEvent): GateState {
  switch (event.kind) {
    case "started": {
      if (state.completed.includes(event.id) || state.pending.some(gate => gate.id === event.id)) return state;
      const revision = state.revision + 1;
      return { ...state, revision, evidence: { kind: "none" }, pending: [...state.pending, { id: event.id, revision, purpose: event.purpose }] };
    }
    case "finished":
      return finishGate(state, event.id, event.outcome);
    case "invalidated":
      return { ...state, revision: state.revision + 1, evidence: { kind: "none" } };
    case "input":
      return event.source === "interactive" || event.source === "rpc"
        ? { ...state, shift: INITIAL_SHIFT, revision: state.revision + 1, evidence: { kind: "none" } }
        : state;
  }
}

function finishGate(state: GateState, id: GateId, outcome: GateOutcome): GateState {
  if (state.completed.includes(id)) return state;
  const gate = state.pending.find(gate => gate.id === id);
  if (!gate) return state; // Disposed/unknown runs cannot affect a different restored branch.
  const pending = state.pending.filter(gate => gate.id !== id);
  const shift = recordGateOutcome(state.shift, outcome);
  const revision = state.revision + 1;
  const evidence: Evidence = gate.revision === state.revision && pending.length === 0 &&
    outcome === "pass" && shift.kind === "building"
    ? { kind: "green", id, revision, purpose: gate.purpose }
    : { kind: "none" };
  return { shift, revision, pending, evidence, completed: [...state.completed, id] };
}

export function gateIsVerified(state: GateState, id: GateId): boolean {
  return state.shift.kind === "building" && state.pending.length === 0 && state.evidence.kind === "green" &&
    state.evidence.id === id && state.evidence.revision === state.revision;
}

export function verificationCanReload(state: GateState, id: GateId, aborted: boolean): boolean {
  return !aborted && gateIsVerified(state, id);
}

export function qaIsAuthorized(state: GateState, featureId: string | undefined, featureListText: string): boolean {
  const evidence = state.evidence;
  return evidence.kind === "green" && gateIsVerified(state, evidence.id) && evidence.purpose.kind === "qa" &&
    evidence.purpose.featureId === featureId && evidence.purpose.featureListText === featureListText;
}

export function qaEvidenceMismatch(state: GateState, featureId: string | undefined, featureListText: string): boolean {
  const evidence = state.evidence;
  return evidence.kind === "green" && evidence.purpose.kind === "qa" &&
    (evidence.purpose.featureId !== featureId || evidence.purpose.featureListText !== featureListText);
}

export function executionOutcome(result: { readonly code: number; readonly killed: boolean }, aborted: boolean): GateOutcome {
  return result.code === 0 && !result.killed && !aborted ? "pass" : "fail";
}

export function restoreStrikes(entries: readonly unknown[]): ShiftState {
  for (const entry of [...entries].reverse()) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (record["type"] !== "custom" || record["customType"] !== STRIKE_ENTRY) continue;
    const data = record["data"];
    if (typeof data === "object" && data !== null) {
      const state = data as Record<string, unknown>;
      if (state["kind"] === "building" && (state["strikes"] === 0 || state["strikes"] === 1)) {
        return { kind: "building", strikes: state["strikes"] };
      }
    }
    return { kind: "haltedForHuman" }; // Corrupt or explicitly halted entries fail closed.
  }
  return INITIAL_SHIFT;
}

export function parseGateEvent(value: unknown): GateEvent | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record["kind"] === "invalidated") return { kind: "invalidated" };
  if (record["kind"] === "input" && typeof record["source"] === "string") return { kind: "input", source: record["source"] };
  const id = record["id"];
  if (typeof id !== "string" && typeof id !== "symbol") return undefined;
  if (record["kind"] === "finished" && (record["outcome"] === "pass" || record["outcome"] === "fail")) {
    return { kind: "finished", id, outcome: record["outcome"] };
  }
  const purpose = parsePurpose(record["purpose"]);
  return record["kind"] === "started" && purpose ? { kind: "started", id, purpose } : undefined;
}

function parsePurpose(value: unknown): GatePurpose | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record["kind"] === "check") return { kind: "check" };
  return record["kind"] === "qa" && typeof record["featureId"] === "string" && typeof record["featureListText"] === "string"
    ? { kind: "qa", featureId: record["featureId"], featureListText: record["featureListText"] }
    : undefined;
}
