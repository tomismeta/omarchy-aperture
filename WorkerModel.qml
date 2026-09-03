import QtQuick
import "WorkerOutputLogic.js" as Protocol

QtObject {
  id: root

  property int generation: 0
  property string status: "connecting"
  property bool presentsSnapshot: false
  property var nowFrame: null
  property var nextFrames: []
  property var ambientFrames: []
  property var sources: []
  property var totals: ({ now: 0, next: 0, ambient: 0, sources: 0 })
  readonly property bool hasNow: presentsSnapshot && nowFrame !== null
  property string disconnectedReason: ""
  property string errorCode: ""
  property string errorMessage: ""
  property bool helloSeen: false
  property string packageVersion: ""
  property string engineState: "starting"
  property double acceptedSources: 0
  property double lastSequence: 0
  property int staleLinesRejected: 0
  property int malformedLinesRejected: 0
  property bool fatalError: false
  signal focusResult(string requestId, string result)


  function reset(nextGeneration) {
    generation = Number(nextGeneration)
    status = "connecting"
    presentsSnapshot = false
    nowFrame = null
    nextFrames = []
    ambientFrames = []
    sources = []
    totals = ({ now: 0, next: 0, ambient: 0, sources: 0 })
    disconnectedReason = ""
    errorCode = ""
    errorMessage = ""
    helloSeen = false
    packageVersion = ""
    engineState = "starting"
    acceptedSources = 0
    lastSequence = 0
    fatalError = false
  }

  function markStartFailure(message, code) {
    presentsSnapshot = false
    fatalError = false
    status = "start_failed"
    errorCode = String(code || "worker_start_failed")
    errorMessage = String(message || "The trusted attention worker could not start.")
  }

  function markIncompatible(message, code) {
    presentsSnapshot = false
    fatalError = false
    status = "surface_incompatible"
    errorCode = String(code || "incompatible_runtime")
    errorMessage = String(message || "The trusted attention worker runtime is incompatible.")
  }

  function markSurfaceError(code, message) {
    fatalError = false
    status = "surface_error"
    errorCode = String(code || "worker_error")
    errorMessage = String(message || "The attention worker reported an error.")
  }

  function markDisconnected(reason, message) {
    fatalError = false
    presentsSnapshot = false
    status = "disconnected"
    disconnectedReason = reason || "connection_failed"
    errorCode = "worker_disconnected"
    errorMessage = String(message || "The attention worker stopped unexpectedly.")
  }

  function markStopped() {
    fatalError = false
    presentsSnapshot = false
    status = "connecting"
    disconnectedReason = ""
    errorCode = ""
    errorMessage = ""
    engineState = "stopped"
  }

  function rejectProtocol(code, message) {
    fatalError = false
    malformedLinesRejected += 1
    presentsSnapshot = false
    status = "protocol_error"
    errorCode = code
    errorMessage = message
  }

  function acceptLine(line, lineGeneration) {
    if (Number(lineGeneration) !== generation) {
      staleLinesRejected += 1
      return false
    }
    if (typeof line !== "string" || line.length === 0) return true
    var result = Protocol.parse(line, helloSeen, lastSequence)
    if (!result.ok) {
      rejectProtocol(result.code, result.error)
      return false
    }
    var message = result.message

    if (result.kind === "hello") {
      helloSeen = true
      packageVersion = message.packageVersion
      return true
    }

    if (result.kind === "engine") {
      fatalError = false
      engineState = message.state
      acceptedSources = message.acceptedSources
      if (message.state === "degraded") {
        status = "surface_error"
        errorCode = "worker_degraded"
        errorMessage = "The attention engine is degraded."
      } else {
        errorCode = ""
        errorMessage = ""
        status = presentsSnapshot ? (nowFrame === null ? "calm" : "attention") : "connecting"
      }
      return true
    }

    if (result.kind === "error") {
      fatalError = message.recoverable === false
      status = "surface_error"
      errorCode = message.code
      errorMessage = message.message
      return true
    }

    if (result.kind === "focus") {
      focusResult(message.requestId, message.result)
      return true
    }

    lastSequence = message.sequence
    fatalError = false
    sources = message.sources
    totals = message.totals
    nowFrame = message.view.now
    nextFrames = message.view.next
    ambientFrames = message.view.ambient
    presentsSnapshot = true
    disconnectedReason = ""
    if (engineState === "degraded") {
      status = "surface_error"
      errorCode = "worker_degraded"
      errorMessage = "The attention engine is degraded."
    } else {
      status = nowFrame === null ? "calm" : "attention"
      errorCode = ""
      errorMessage = ""
    }
    return true
  }
}
