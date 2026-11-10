// Pure harness mode statechart decisions (/plan, /shift, /quint-sync, /qa).
// Mirrors spec/harness_lifecycle.qnt inv_no_unverified_pass: a feature may only be marked
// passing from QA mode, after the deterministic gate ran green, with no other files mutated.
import {
  assertNever,
  evaluatePlanModeShell,
  evaluatePlanModeWrite,
  isFeatureListPath,
  type GuardDecision,
} from "./guardrail-rules.ts";

export type HarnessMode =
  | { readonly kind: "normal" }
  | { readonly kind: "plan"; readonly planFile: string }
  | { readonly kind: "shift"; readonly featureId: string | undefined }
  | { readonly kind: "quint"; readonly target: string }
  | { readonly kind: "qa"; readonly featureId: string | undefined; readonly checksGreen: boolean };

export type ModeToolCall =
  | { readonly kind: "shell"; readonly command: string }
  | { readonly kind: "fileMutation"; readonly relPath: string; readonly currentText: string | undefined; readonly nextText: string };

export type Feature = { readonly id: string; readonly description: string; readonly passes: boolean };

const ALLOW: GuardDecision = { allowed: true };
const deny = (reason: string): GuardDecision => ({ allowed: false, reason });

export function countPassing(featureListText: string): number {
  return (featureListText.match(/"passes"\s*:\s*true/g) ?? []).length;
}

export function evaluateModeToolCall(mode: HarnessMode, call: ModeToolCall): GuardDecision {
  if (call.kind === "fileMutation" && isFeatureListPath(call.relPath)) {
    return evaluateFeatureListMutation(mode, call.currentText ?? "", call.nextText);
  }
  switch (mode.kind) {
    case "normal":
    case "shift":
    case "quint":
      return ALLOW;
    case "plan":
      return call.kind === "shell" ? evaluatePlanModeShell(call.command) : evaluatePlanModeWrite(call.relPath, mode.planFile);
    case "qa":
      return call.kind === "shell"
        ? relabel(evaluatePlanModeShell(call.command), "PLAN MODE", "QA MODE")
        : deny(`QA MODE: QA is an evaluation pass; editing '${call.relPath}' is blocked. REMEDIATION: Reject back to /shift to change code.`);
    default:
      return assertNever(mode);
  }
}

function evaluateFeatureListMutation(mode: HarnessMode, currentText: string, nextText: string): GuardDecision {
  if (countPassing(nextText) <= countPassing(currentText)) return ALLOW;
  if (mode.kind !== "qa") {
    return deny(
      `UNVERIFIED PASS (inv_no_unverified_pass): features may only be marked passing from /qa. ` +
        `REMEDIATION: Finish the shift, then run /qa so the deterministic gate re-runs before any '"passes": true'.`,
    );
  }
  if (!mode.checksGreen) {
    return deny(`UNVERIFIED PASS (inv_no_unverified_pass): the /qa deterministic gate is not green. REMEDIATION: Reject back to /shift and fix the failures.`);
  }
  return ALLOW;
}

function relabel(decision: GuardDecision, from: string, to: string): GuardDecision {
  return decision.allowed ? decision : deny(decision.reason.replace(from, to));
}

/** Parses feature_list.json text at the edge; returns undefined when the shape is not a feature list. */
export function parseFeatureList(text: string): Feature[] | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!Array.isArray(raw)) return undefined;
  const features = raw.flatMap((entry: unknown): Feature[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const { id, description, passes } = entry as Record<string, unknown>;
    return typeof id === "string" && typeof description === "string" && typeof passes === "boolean" ? [{ id, description, passes }] : [];
  });
  return features.length === raw.length ? features : undefined;
}

/** The requested feature if given, else the first feature that is not yet passing. */
export function selectFeature(features: readonly Feature[], requestedId: string): Feature | undefined {
  const id = requestedId.trim();
  return id ? features.find((feature) => feature.id === id) : features.find((feature) => !feature.passes);
}

export function planFileFor(goal: string): string {
  const slug = goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `plans/${slug || "plan"}.md`;
}

export function formatModeStatus(mode: HarnessMode): string | undefined {
  switch (mode.kind) {
    case "normal":
      return undefined;
    case "plan":
      return `📝 MODE: PLAN (read-only → ${mode.planFile})`;
    case "shift":
      return `🔨 MODE: SHIFT${mode.featureId ? ` (${mode.featureId})` : ""}`;
    case "quint":
      return `🔬 MODE: QUINT SYNC (${mode.target})`;
    case "qa":
      return `🧪 MODE: QA${mode.featureId ? ` (${mode.featureId})` : ""} · gate ${mode.checksGreen ? "green" : "red"}`;
    default:
      return assertNever(mode);
  }
}
