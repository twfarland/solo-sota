// spec/harness_lifecycle.qnt
// Guard-level model of the Solo-SOTA harness statechart. Companion: spec/harness_lifecycle.md.
// Not an effect-level proof: shell/custom-tool mediation remains out of scope.
// Gate receipt identity, revisions and concurrency are modeled in gate_evidence.qnt.
// As-built code mirrored by this model:
//   - strike cap ............ src/rules/strike-rules.ts (recordGateOutcome, evaluateMutationUnderStrikes)
//   - feature pass contract . src/rules/guardrail-rules.ts (evaluateFeatureListEdit) + extensions/plan-quint-qa-modes.ts (/qa)
module harness_lifecycle {
  type Phase = Plan | ShiftBuild | QaEval | HaltedForHuman
  type FeatureId = FirstFeature | SecondFeature

  type State = {
    phase: Phase,
    strikes: int,
    checksGreen: bool,
    featureMarkedPass: bool,
    selectedFeature: FeatureId,
    approvedFeature: FeatureId,
    filesMutated: bool
  }

  var s: State

  action init = {
    s' = {
      phase: Plan,
      strikes: 0,
      checksGreen: true,
      featureMarkedPass: false,
      selectedFeature: FirstFeature,
      approvedFeature: FirstFeature,
      filesMutated: false
    }
  }

  action startShift = all {
    s.phase == Plan or s.phase == HaltedForHuman,
    s' = { ...s, phase: ShiftBuild, strikes: 0, filesMutated: false }
  }

  action mutateCode = all {
    s.phase == ShiftBuild,
    s.strikes < 2,
    s' = { ...s, filesMutated: true, checksGreen: false, featureMarkedPass: false }
  }

  action deterministicGatePass = all {
    s.phase == ShiftBuild,
    s.filesMutated,
    s' = { ...s, filesMutated: false, checksGreen: true, strikes: 0 }
  }

  action deterministicGateFail = {
    val nextStrikes = s.strikes + 1
    val nextPhase = if (nextStrikes >= 2) HaltedForHuman else ShiftBuild
    all {
      s.phase == ShiftBuild,
      s.filesMutated,
      s' = { ...s, filesMutated: false, checksGreen: false, strikes: nextStrikes, phase: nextPhase }
    }
  }

  action enterQa = all {
    s.phase == ShiftBuild,
    s.checksGreen,
    not(s.filesMutated),
    s.strikes < 2,
    s' = { ...s, phase: QaEval, selectedFeature: FirstFeature }
  }

  // Approval is checked for each newly passing feature, never by net pass count.
  action qaApproveFeature(feature: FeatureId): bool = all {
    s.phase == QaEval,
    s.checksGreen,
    not(s.filesMutated),
    feature == s.selectedFeature,
    s' = { ...s, featureMarkedPass: true, approvedFeature: feature }
  }

  action qaApproveAndMarkPass = qaApproveFeature(FirstFeature)
  action qaApproveOtherFeature = qaApproveFeature(SecondFeature)

  action enterOtherQa = all {
    s.phase == ShiftBuild,
    s.checksGreen,
    not(s.filesMutated),
    s.strikes < 2,
    s' = { ...s, phase: QaEval, selectedFeature: SecondFeature }
  }

  action qaRejectToShift = all {
    s.phase == QaEval,
    s' = { ...s, phase: ShiftBuild, featureMarkedPass: false }
  }

  action qaEvidenceInvalidated = all {
    s.phase == QaEval,
    s' = { ...s, checksGreen: false, featureMarkedPass: false }
  }

  action qaGateFail = {
    val nextStrikes = s.strikes + 1
    val nextPhase = if (nextStrikes >= 2) HaltedForHuman else QaEval
    all {
      s.phase == QaEval,
      s' = { ...s, phase: nextPhase, strikes: nextStrikes, checksGreen: false, featureMarkedPass: false }
    }
  }

  action qaOtherGatePass = all {
    s.phase == QaEval,
    s' = { ...s, strikes: 0, checksGreen: false, featureMarkedPass: false }
  }

  action runtimeReload = {
    val nextPhase = if (s.strikes == 2) HaltedForHuman else Plan
    s' = { ...s, phase: nextPhase, checksGreen: false, featureMarkedPass: false, filesMutated: false }
  }

  action step = any {
    startShift,
    mutateCode,
    deterministicGatePass,
    deterministicGateFail,
    enterQa,
    enterOtherQa,
    qaApproveAndMarkPass,
    qaApproveOtherFeature,
    qaRejectToShift,
    qaEvidenceInvalidated,
    qaGateFail,
    qaOtherGatePass,
    runtimeReload
  }

  // SAFETY INVARIANT 1: Feature is never marked passing unless in QaEval with green checks and zero uncommitted mutations
  val inv_no_unverified_pass =
    s.featureMarkedPass implies (s.phase == QaEval and s.checksGreen and not(s.filesMutated))

  val inv_qa_feature_scoped =
    s.featureMarkedPass implies s.approvedFeature == s.selectedFeature

  // SAFETY INVARIANT 2: Strikes never exceed 2, and reaching 2 strikes immediately halts for human steering
  val inv_strike_cap_enforced =
    (s.strikes <= 2) and (s.strikes == 2 implies s.phase == HaltedForHuman)

  // TEETH WITNESS: Prove that qaApproveAndMarkPass is actually reachable (must be violated in check/prove)
  val inv_teeth_can_reach_pass = not(s.featureMarkedPass)

  run happyPathTest =
    init
      .then(startShift)
      .then(mutateCode)
      .then(deterministicGatePass)
      .then(enterQa)
      .then(qaApproveAndMarkPass)
      .expect(s.featureMarkedPass and inv_no_unverified_pass and inv_strike_cap_enforced)

  run selectedFeatureTest =
    init
      .then(startShift)
      .then(mutateCode)
      .then(deterministicGatePass)
      .then(enterOtherQa)
      .then(qaApproveOtherFeature)
      .expect(s.featureMarkedPass and s.approvedFeature == SecondFeature and inv_qa_feature_scoped)

  run staleQaGateTest =
    init.then(startShift).then(mutateCode).then(deterministicGatePass).then(enterQa)
      .then(qaGateFail).expect(not(s.checksGreen) and not(s.featureMarkedPass) and s.strikes == 1)

  run reloadPreservesHaltTest =
    init.then(startShift).then(mutateCode).then(deterministicGatePass).then(enterQa)
      .then(qaGateFail).then(qaGateFail).then(runtimeReload)
      .expect(s.phase == HaltedForHuman and s.strikes == 2 and not(s.checksGreen))

  run twoStrikeHaltTest =
    init
      .then(startShift)
      .then(mutateCode)
      .then(deterministicGateFail)
      .then(mutateCode)
      .then(deterministicGateFail)
      .expect(s.phase == HaltedForHuman and s.strikes == 2)
}
