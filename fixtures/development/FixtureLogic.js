function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function focusHandle(lane, index) {
  var seed = "fixture-" + lane + "-" + String(index) + "-"
  while (seed.length < 32) seed += "x"
  return seed.slice(0, 32)
}

function fixtureFrame(template, lane, index, navigable) {
  var frame = clone(template)
  frame.id = "fixture:" + lane + ":frame:" + String(index)
  frame.taskId = "fixture:" + lane + ":task:" + String(index)
  frame.interactionId = "fixture:" + lane + ":interaction:" + String(index)
  frame.version = index + 1
  frame.source = {
    kind: "omp",
    label: "OMP"
  }
  if (navigable) {
    frame.navigation = {
      kind: "opaque-focus",
      handle: focusHandle(lane, index)
    }
  } else {
    delete frame.navigation
  }
  return frame
}

function hierarchy(nowSnapshot, ambientSnapshot) {
  var now = fixtureFrame(nowSnapshot.view.now, "now", 0, true)
  now.title = "Approve the production migration"
  now.summary = "Deployment is paused until this approval is resolved."
  now.provenance = {
    whyNow: "A production gate needs an explicit decision before work can continue."
  }

  var nextTemplate = nowSnapshot.view.next[0]
  var nextTitles = [
    "Review the failed integration check",
    "Choose the rollout window",
    "Confirm the release notes"
  ]
  var nextSummaries = [
    "The session preserved failure context and can resume in place.",
    "Two valid deployment windows are ready for selection.",
    "The final summary is ready before publishing."
  ]
  var nextFrames = []
  for (var nextIndex = 0; nextIndex < nextTitles.length; nextIndex++) {
    var next = fixtureFrame(nextTemplate, "next", nextIndex, true)
    next.title = nextTitles[nextIndex]
    next.summary = nextSummaries[nextIndex]
    nextFrames.push(next)
  }

  var ambientTemplate = ambientSnapshot.view.ambient[0]
  var ambientTitles = [
    "Background analysis is running",
    "Documentation index is updating",
    "Release artifact is being prepared",
    "Session is waiting for a stop event"
  ]
  var ambientFrames = []
  for (var ambientIndex = 0; ambientIndex < ambientTitles.length; ambientIndex++) {
    var ambient = fixtureFrame(ambientTemplate, "ambient", ambientIndex, false)
    ambient.title = ambientTitles[ambientIndex]
    ambient.summary = "No action is required from you."
    ambientFrames.push(ambient)
  }

  return {
    type: "snapshot",
    sequence: 1,
    sources: [
      { kind: "omp", label: "OMP" },
      { kind: "omp", label: "OMP" }
    ],
    totals: {
      now: 1,
      next: nextFrames.length,
      ambient: ambientFrames.length,
      sources: 2
    },
    view: {
      now: now,
      next: nextFrames,
      ambient: ambientFrames
    }
  }
}

function nextOnly(nowSnapshot, ambientSnapshot) {
  var snapshot = hierarchy(nowSnapshot, ambientSnapshot)
  snapshot.view.next = [snapshot.view.now].concat(snapshot.view.next)
  snapshot.view.now = null
  snapshot.totals.now = 0
  snapshot.totals.next = snapshot.view.next.length
  return snapshot
}

function nonNavigableNow(nowSnapshot, ambientSnapshot) {
  var snapshot = hierarchy(nowSnapshot, ambientSnapshot)
  delete snapshot.view.now.navigation
  snapshot.view.next = []
  snapshot.totals.next = 0
  return snapshot
}

function longText(nowSnapshot, ambientSnapshot) {
  var snapshot = hierarchy(nowSnapshot, ambientSnapshot)
  snapshot.view.now.title = "Approve the production migration after reviewing the complete compatibility report for every connected environment and deployment target"
  snapshot.view.now.summary = "This deliberately long summary verifies that the primary card wraps bounded protocol text without widening the panel or hiding the decision context. The content remains inside the worker protocol limit while exercising several lines at narrow panel widths."
  snapshot.view.now.provenance.whyNow = "The deployment is paused at an explicit approval boundary. The session retained the relevant context, no automated fallback is permitted, and the next operation cannot start until the connected operator chooses whether to continue."
  snapshot.view.next[0].title = "Review the failed integration check whose bounded title must elide rather than expand the compact queue row beyond the panel width"
  snapshot.view.next[0].summary = "A bounded but intentionally verbose explanation confirms compact NEXT rows remain scannable."
  return snapshot
}

function clipped(nowSnapshot, ambientSnapshot) {
  var snapshot = hierarchy(nowSnapshot, ambientSnapshot)
  snapshot.totals.next = 8
  snapshot.totals.ambient = 11
  return snapshot
}

function minimal(nowSnapshot) {
  var now = fixtureFrame(nowSnapshot.view.now, "minimal", 0, true)
  delete now.summary
  delete now.source
  delete now.context
  delete now.provenance
  return {
    type: "snapshot",
    sequence: 1,
    sources: [{ kind: "omp", label: "OMP" }],
    totals: { now: 1, next: 0, ambient: 0, sources: 1 },
    view: { now: now, next: [], ambient: [] }
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    hierarchy: hierarchy,
    nextOnly: nextOnly,
    nonNavigableNow: nonNavigableNow,
    longText: longText,
    clipped: clipped,
    minimal: minimal
  }
}
