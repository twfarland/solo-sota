// Finite abstraction of gate-evidence-rules.ts: two run IDs and two QA features.
// Generic check purpose is 0; QA purposes are feature IDs 1 and 2.
module gate_evidence {
  type Slot = { revision: int, purpose: int, backlog: int }
  type State = {
    active: bool,
    revision: int,
    strikes: int,
    pending: Set[int],
    completed: Set[int],
    slots: int -> Slot,
    green: bool,
    evidenceId: int,
    evidenceRevision: int,
    backlog: int,
    selectedFeature: int,
    approved: bool,
    reloadRequest: int,
    reloadChecked: bool
  }
  var s: State
  pure val emptySlots = Map(
    0 -> { revision: -1, purpose: 0, backlog: 0 },
    1 -> { revision: -1, purpose: 0, backlog: 0 }
  )

  action init = s' = {
    active: false, revision: 0, strikes: 0, pending: Set(), completed: Set(),
    slots: emptySlots, green: false, evidenceId: 0, evidenceRevision: -1,
    backlog: 0, selectedFeature: 1, approved: false, reloadRequest: -1, reloadChecked: false
  }
  action initialize = all {
    not(s.active),
    s' = { ...s, active: true }
  }

  action start(id: int, purpose: int): bool = all {
    s.active,
    not(s.pending.contains(id)),
    not(s.completed.contains(id)),
    s' = { ...s, revision: s.revision + 1, pending: s.pending.union(Set(id)),
      slots: s.slots.set(id, { revision: s.revision + 1, purpose: purpose, backlog: s.backlog }),
      green: false, approved: false, reloadChecked: false }
  }
  action finish(id: int, ok: bool): bool = {
    val pending = s.pending.exclude(Set(id))
    val strikes = if (s.strikes == 2) 2 else if (ok) 0 else s.strikes + 1
    val green = s.pending.contains(id) and s.slots.get(id).revision == s.revision and
      pending == Set() and ok and strikes < 2
    all {
      s.active,
      if (s.completed.contains(id) or not(s.pending.contains(id))) s' = s
      else s' = { ...s, revision: s.revision + 1, strikes: strikes, pending: pending,
        completed: s.completed.union(Set(id)), green: green, evidenceId: id,
        evidenceRevision: s.revision + 1, approved: false, reloadChecked: false }
    }
  }
  action invalidate = all {
    s.active,
    s' = { ...s, revision: s.revision + 1, green: false, approved: false, reloadChecked: false }
  }
  action backlogChanged = all {
    s.active,
    s' = { ...s, backlog: s.backlog + 1, approved: false, reloadChecked: false }
  }
  action chooseSecondFeature = all {
    s.active,
    s' = { ...s, selectedFeature: 2, revision: s.revision + 1, green: false, approved: false, reloadChecked: false }
  }
  action approve = all {
    s.active,
    s.green,
    s.strikes < 2,
    s.evidenceRevision == s.revision,
    s.pending == Set(),
    s.slots.get(s.evidenceId).purpose == s.selectedFeature,
    s.slots.get(s.evidenceId).backlog == s.backlog,
    s' = { ...s, approved: true }
  }
  action operatorInput = all {
    s.active,
    s' = { ...s, strikes: 0, revision: s.revision + 1, green: false, approved: false, reloadChecked: false }
  }
  action extensionInput = s' = s
  action reload = s' = { ...s, active: false, revision: 0, pending: Set(), completed: Set(),
    slots: emptySlots, green: false, evidenceRevision: -1, approved: false, reloadRequest: -1, reloadChecked: false }

  // Add a legal, uninterrupted start→pass→approve trace as a macro-step so the
  // shallow sampler exercises the useful fast path as well as event interleavings.
  // All fine-grained actions remain in step; no safety behavior is removed.
  action successfulQaRoundTrip = all {
    s.active,
    s.pending == Set(),
    not(s.completed.contains(0)),
    s.strikes < 2,
    s' = { ...s, revision: s.revision + 2, strikes: 0,
      slots: s.slots.set(0, { revision: s.revision + 1, purpose: s.selectedFeature, backlog: s.backlog }),
      completed: s.completed.union(Set(0)), green: true, evidenceId: 0,
      evidenceRevision: s.revision + 2, approved: true, reloadChecked: false }
  }

  action queueReload = all {
    s.active,
    s.green,
    s.slots.get(s.evidenceId).purpose == 0,
    s' = { ...s, reloadRequest: s.evidenceId, reloadChecked: false }
  }
  action cancelReload = all {
    s.reloadRequest == 0 or s.reloadRequest == 1,
    s' = { ...s, reloadRequest: 2, reloadChecked: false }
  }
  val canReload = s.active and s.green and s.strikes < 2 and
    s.evidenceRevision == s.revision and s.pending == Set() and
    s.reloadRequest == s.evidenceId and s.slots.get(s.evidenceId).purpose == 0
  action executeReloadCheck = all {
    canReload,
    s' = { ...s, reloadChecked: true }
  }

  action step = any {
    initialize, successfulQaRoundTrip, start(0, 1), start(1, 0), start(1, 2),
    finish(0, true), finish(0, false), finish(1, true), finish(1, false),
    invalidate, backlogChanged, chooseSecondFeature, approve, operatorInput, extensionInput, reload,
    queueReload, cancelReload, executeReloadCheck
  }

  val inv_green_is_current = s.green implies
    (s.active and s.strikes < 2 and s.evidenceRevision == s.revision and s.pending == Set())
  val inv_approval_has_matching_evidence = s.approved implies
    (s.green and s.slots.get(s.evidenceId).purpose == s.selectedFeature and
      s.slots.get(s.evidenceId).backlog == s.backlog)
  val inv_reload_uses_live_check = s.reloadChecked implies canReload
  val inv_strikes_bounded = s.strikes >= 0 and s.strikes <= 2
  val inv_teeth_approval_reachable = not(s.approved)

  run cancelledQueuedReloadTest = init.then(initialize).then(start(1, 0)).then(finish(1, true))
    .then(queueReload).then(cancelReload).expect(not(canReload))
  run staleQueuedReloadTest = init.then(initialize).then(start(1, 0)).then(finish(1, true))
    .then(queueReload).then(invalidate).expect(not(canReload))
  run validReloadCheckTest = init.then(initialize).then(start(1, 0)).then(finish(1, true))
    .then(queueReload).then(executeReloadCheck).expect(s.reloadChecked and inv_reload_uses_live_check)

  run qaEvidenceTest = init.then(initialize).then(start(0, 1)).then(finish(0, true)).then(approve)
    .expect(s.approved and inv_approval_has_matching_evidence)
  run staleGateTest = init.then(initialize).then(start(0, 1)).then(finish(0, true))
    .then(start(1, 0)).then(finish(1, false)).expect(not(s.green) and not(s.approved) and s.strikes == 1)
  run overlappingGateTest = init.then(initialize).then(start(0, 1)).then(start(1, 0))
    .then(finish(1, true)).then(finish(0, true)).expect(not(s.green))
  run mutationDuringGateTest = init.then(initialize).then(start(0, 1)).then(invalidate)
    .then(finish(0, true)).expect(not(s.green))
  run duplicateReceiptTest = init.then(initialize).then(start(0, 1)).then(finish(0, false))
    .then(finish(0, false)).expect(s.strikes == 1)
  run lateBranchPassTest = init.then(initialize).then(start(0, 1)).then(finish(0, false))
    .then(start(1, 0)).then(reload).then(initialize).then(finish(1, true))
    .expect(s.strikes == 1 and not(s.green))
  run lateBranchFailureTest = init.then(initialize).then(start(0, 1)).then(finish(0, false))
    .then(start(1, 0)).then(reload).then(initialize).then(finish(1, false))
    .expect(s.strikes == 1 and not(s.green))
  run lateReceiptPreservesNewQaTest = init.then(initialize).then(start(1, 0)).then(reload)
    .then(initialize).then(start(0, 1)).then(finish(0, true)).then(approve).then(finish(1, false))
    .expect(s.approved and s.green and s.strikes == 0)
  run reloadHaltTest = init.then(initialize).then(start(0, 1)).then(finish(0, false))
    .then(start(1, 0)).then(finish(1, false)).then(reload).then(initialize)
    .then(extensionInput).expect(s.strikes == 2 and not(s.green))
}
