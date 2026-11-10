// Pure 2-strike retry cap. Mirrors spec/harness_lifecycle.qnt (inv_strike_cap_enforced):
// reaching STRIKE_CAP consecutive deterministic-gate failures halts the agent for human steering.
// The union makes "2 strikes while still building" unrepresentable.
import type { GuardDecision } from "./guardrail-rules.ts";
import { assertNever } from "./guardrail-rules.ts";

export const STRIKE_CAP = 2;

export type ShiftState =
  | { readonly kind: "building"; readonly strikes: 0 | 1 }
  | { readonly kind: "haltedForHuman" };

export type GateOutcome = "pass" | "fail";

/** Start of a shift. A human message is the only way out of HaltedForHuman (Quint: startShift resets strikes). */
export const INITIAL_SHIFT: ShiftState = { kind: "building", strikes: 0 };

export function recordGateOutcome(state: ShiftState, outcome: GateOutcome): ShiftState {
  switch (state.kind) {
    case "haltedForHuman":
      return state;
    case "building":
      if (outcome === "pass") return INITIAL_SHIFT;
      return state.strikes === 0 ? { kind: "building", strikes: 1 } : { kind: "haltedForHuman" };
    default:
      return assertNever(state);
  }
}

export function strikeCount(state: ShiftState): number {
  switch (state.kind) {
    case "building":
      return state.strikes;
    case "haltedForHuman":
      return STRIKE_CAP;
    default:
      return assertNever(state);
  }
}

export function evaluateMutationUnderStrikes(state: ShiftState): GuardDecision {
  switch (state.kind) {
    case "building":
      return { allowed: true };
    case "haltedForHuman":
      return {
        allowed: false,
        reason:
          `2-STRIKE CAP REACHED: Deterministic checks failed ${STRIKE_CAP} times in a row. ` +
          `REMEDIATION: Stop mutating files. Summarise the failure, the hypotheses tried, and ask the human operator for steering.`,
      };
    default:
      return assertNever(state);
  }
}

const DETERMINISTIC_GATE_REGEX =
  /(?:\b(?:init|check|prove)\.sh(?![\w.])|\bnode\s+--test\b|\bnpm\s+(?:test|run\s+(?:test|typecheck|lint\S*))\b|\btsc\b|\bvitest\b|\blint-architecture\b|\bgradlew(?:\.bat)?\b.*\b(?:test|check|build)\b|\bcargo\s+(?:test|check|build|clippy)\b)/;

/** Whether a shell command is a deterministic gate whose exit code counts toward the strike cap. */
export function isDeterministicGateCommand(command: string): boolean {
  return DETERMINISTIC_GATE_REGEX.test(command);
}

export function formatStrikeStatus(state: ShiftState): string {
  switch (state.kind) {
    case "building":
      return `🛡 Solo-SOTA · guards on · strikes ${state.strikes}/${STRIKE_CAP}`;
    case "haltedForHuman":
      return `🛑 Solo-SOTA · HALTED for human steering (${STRIKE_CAP}/${STRIKE_CAP} strikes)`;
    default:
      return assertNever(state);
  }
}
