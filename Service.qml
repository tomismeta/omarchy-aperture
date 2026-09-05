import QtQuick
import Quickshell
import Quickshell.Io
import "WorkerBridgeLogic.js" as Bridge

Item {
  id: root
  visible: false

  // Injected by the Omarchy service loader.
  property string omarchyPath: ""
  property var shell: null
  property var manifest: null
  property var pluginRegistry: null

  readonly property string pluginDir: manifest && manifest.__sourceDir
    ? String(manifest.__sourceDir) : ""
  readonly property string launcherPath: pluginDir === ""
    ? "" : pluginDir + "/bin/aperture-attention-engine"
  readonly property int pluginRegistryRevision: pluginRegistry
    && pluginRegistry.registryRevision !== undefined
    ? Number(pluginRegistry.registryRevision) : 0
  readonly property bool pluginEnabled: {
    var revision = pluginRegistryRevision
    return pluginRegistry !== null && manifest !== null
      && (typeof pluginRegistry.isEnabled !== "function"
        || pluginRegistry.isEnabled(String(manifest.id || "")))
  }
  readonly property bool pluginReady: pluginDir !== "" && launcherPath !== ""
    && shell !== null && manifest !== null && pluginRegistry !== null && pluginEnabled
  readonly property bool readyForWorker: processEnabled && !shutdownRequested && pluginReady
  readonly property string ipcTarget: manifest && manifest.id
    ? String(manifest.id) + ".worker" : "aperture.worker"

  // Process ownership. The manifest cutover keeps this service loaded exactly once.
  property bool processEnabled: true
  property var workerProcess: null
  property int activeGeneration: 0
  property int processStartCount: 0
  property int processExitCount: 0
  property int activeProcessCount: 0
  property int maximumConcurrentProcesses: 0
  property bool launchPending: false
  property bool acceptingEvents: false
  property int restartAttempt: 0
  property bool shutdownRequested: false
  property bool teardownInProgress: false
  property string teardownMode: "none"
  property bool cleanupLaunched: false
  property int shutdownWriteCount: 0
  property int termSignalCount: 0
  property int killSignalCount: 0
  property int staleProcessCallbacks: 0
  readonly property int processReferenceCount: workerProcess === null ? 0 : 1
  readonly property int activeTimerCount: (inputPump.running ? 1 : 0)
    + (restartTimer.running ? 1 : 0)
    + (stabilityTimer.running ? 1 : 0)
    + (gracefulTimer.running ? 1 : 0)
    + (hardStopTimer.running ? 1 : 0)

  // Bounded transport state.
  readonly property int maxOutputLineBytes: 256 * 1024
  property string outputBuffer: ""
  readonly property int maxPendingFocusRequests: 16
  property var inputQueue: Bridge.createQueue()
  property int pendingInputCount: 0
  property int rejectedInputCount: 0
  property int rejectedOutputCount: 0
  property int focusRequestSerial: 0
  property var pendingFocusRequests: Bridge.createFocusRequestLedger(maxPendingFocusRequests)
  property int pendingFocusRequestCount: 0
  property int staleFocusResultCount: 0
  property int focusCompletedCount: 0
  property string lastFocusResult: ""
  property int focusRequestAttemptCount: 0
  property int focusRequestRejectedCount: 0
  property string lastFocusRequestDisposition: ""
  property int focusDiagnosticCount: 0
  property string lastFocusDiagnostic: ""
  signal focusCompleted(string requestId, string handle, string result)

  readonly property string status: workerModel.status
  readonly property bool workerReady: workerProcess !== null
    && workerProcess.generation === activeGeneration
    && workerModel.generation === activeGeneration && workerModel.ready
  readonly property bool presentsSnapshot: workerModel.presentsSnapshot
  readonly property var nowFrame: workerModel.nowFrame
  readonly property var nextFrames: workerModel.nextFrames
  readonly property var ambientFrames: workerModel.ambientFrames
  readonly property var sources: workerModel.sources
  readonly property var totals: workerModel.totals
  readonly property bool hasNow: workerModel.hasNow
  readonly property string disconnectedReason: workerModel.disconnectedReason
  readonly property string errorCode: workerModel.errorCode
  readonly property string errorMessage: workerModel.errorMessage

  WorkerModel {
    id: workerModel
    onFocusResult: function(requestId, result) {
      root.acceptFocusResult(requestId, result)
    }
  }

  function acceptWorkerDiagnostic(data) {
    var allowed = [
      "resolve-pane",
      "lease-before-focus",
      "pane-focus",
      "pane-snapshot",
      "dispatch",
      "active-confirm-timeout",
      "inner-reconfirm",
      "capacity",
      "exception"
    ]
    var lines = String(data || "").split(/\r?\n/)
    for (var index = 0; index < lines.length && index < 16; index++) {
      var prefix = "Aperture focus "
      if (lines[index].indexOf(prefix) !== 0) continue
      var stage = lines[index].substring(prefix.length)
      if (allowed.indexOf(stage) === -1) continue
      focusDiagnosticCount += 1
      lastFocusDiagnostic = stage
    }
  }


  function updateProcessCount(value) {
    activeProcessCount = Math.max(0, Number(value))
    maximumConcurrentProcesses = Math.max(maximumConcurrentProcesses, activeProcessCount)
  }

  function resetInputQueue() {
    Bridge.clearQueue(inputQueue)
    pendingInputCount = 0
    inputPump.stop()
    clearFocusRequests("stale")
  }

  function clearFocusRequests(result) {
    var pending = Bridge.clearFocusRequests(pendingFocusRequests)
    pendingFocusRequestCount = pendingFocusRequests.count
    for (var index = 0; index < pending.length; index++) {
      focusCompletedCount += 1
      lastFocusResult = result
      focusCompleted(pending[index].requestId, pending[index].handle, result)
    }
  }

  function acceptFocusResult(requestId, result) {
    var handle = Bridge.takeFocusRequest(pendingFocusRequests, String(requestId))
    if (handle === null) {
      staleFocusResultCount += 1
      return
    }
    pendingFocusRequestCount = pendingFocusRequests.count
    focusCompletedCount += 1
    lastFocusResult = String(result)
    focusCompleted(String(requestId), String(handle), String(result))
  }

  function requestFocus(handle) {
    focusRequestAttemptCount += 1
    if (pendingFocusRequestCount >= maxPendingFocusRequests) {
      focusRequestRejectedCount += 1
      lastFocusRequestDisposition = "capacity"
      return ""
    }
    if (pendingFocusRequestCount > 0) {
      focusRequestRejectedCount += 1
      lastFocusRequestDisposition = "busy"
      return ""
    }
    focusRequestSerial = focusRequestSerial >= 9007199254740000 ? 1 : focusRequestSerial + 1
    var requestId = "focus-" + activeGeneration + "-" + focusRequestSerial
    var message = Bridge.projectFocusActivation(requestId, handle)
    if (message === null) {
      focusRequestRejectedCount += 1
      lastFocusRequestDisposition = "invalid"
      return ""
    }
    if (!Bridge.addFocusRequest(pendingFocusRequests, requestId, handle)) {
      focusRequestRejectedCount += 1
      lastFocusRequestDisposition = "capacity"
      return ""
    }
    pendingFocusRequestCount = pendingFocusRequests.count
    if (enqueueMessage(message)) {
      lastFocusRequestDisposition = "queued"
      return requestId
    }
    Bridge.takeFocusRequest(pendingFocusRequests, requestId)
    pendingFocusRequestCount = pendingFocusRequests.count
    focusRequestRejectedCount += 1
    lastFocusRequestDisposition = "unavailable"
    return ""
  }

  function scheduleRestart() {
    if (!readyForWorker || shutdownRequested || teardownInProgress) return
    restartTimer.interval = Math.min(1000 * Math.pow(2, restartAttempt), 30000)
    restartAttempt = Math.min(restartAttempt + 1, 30)
    restartTimer.restart()
  }

  function requestStart() {
    if (!readyForWorker || shutdownRequested || teardownInProgress
        || workerProcess !== null || launchPending || restartTimer.running) return false
    startWorker()
    return true
  }

  function startWorker() {
    if (!readyForWorker || workerProcess !== null || launchPending) return
    activeGeneration += 1
    workerModel.reset(activeGeneration)
    resetInputQueue()
    outputBuffer = ""
    cleanupLaunched = false
    teardownMode = "none"
    launchPending = true
    var child = workerComponent.createObject(root, {
      generation: activeGeneration,
      command: [launcherPath],
      workingDirectory: pluginDir,
      stdinEnabled: true
    })
    if (!child) {
      launchPending = false
      workerModel.markStartFailure("The trusted attention worker process could not be created.")
      return
    }
    workerProcess = child
    child.running = true
  }

  function workerStarted(child) {
    if (child !== workerProcess || child.generation !== activeGeneration) {
      staleProcessCallbacks += 1
      if (child.running) child.running = false
      return
    }
    launchPending = false
    processStartCount += 1
    updateProcessCount(1)
    acceptingEvents = readyForWorker && !teardownInProgress && workerReady
  }

  function mapWorkerExit(exitCode) {
    if (exitCode === 74 || exitCode === 75) {
      workerModel.markDirectTransportFailure(exitCode === 75)
      return workerModel.fatalError ? "latch" : "restart"
    }
    if (exitCode === 65) {
      workerModel.markStartFailure(
        "The installed attention payload failed provenance verification.",
        "payload_verification_failed")
      return "latch"
    }
    if (exitCode === 66) {
      workerModel.markStartFailure(
        "The installed attention payload is incomplete.",
        "payload_missing")
      return "latch"
    }
    if (exitCode === 69) {
      workerModel.markIncompatible(
        "Node is missing from the stock Omarchy runtime.",
        "node_missing")
      return "latch"
    }
    if (exitCode === 77) {
      workerModel.markStartFailure(
        "The installed attention payload is not approved for production.",
        "payload_not_production")
      return "latch"
    }
    if (exitCode === 78) {
      workerModel.markIncompatible(
        "The installed Node runtime is incompatible; Node 22 or newer is required.",
        "node_incompatible")
      return "latch"
    }
    workerModel.markDisconnected("connection_failed", "The attention worker stopped unexpectedly.")
    return "restart"
  }

  function releaseWorker(child) {
    if (!child || child.released) return
    child.released = true
    if (workerProcess === child) workerProcess = null
    Qt.callLater(function() { child.destroy() })
  }

  function workerExited(child, exitCode, exitStatus) {
    if (child !== workerProcess || child.generation !== activeGeneration) {
      staleProcessCallbacks += 1
      releaseWorker(child)
      return
    }
    var unterminatedOutput = outputBuffer !== ""
    outputBuffer = ""
    launchPending = false
    stabilityTimer.stop()
    gracefulTimer.stop()
    hardStopTimer.stop()
    processExitCount += 1
    updateProcessCount(0)
    releaseWorker(child)

    // Reserved transport exits take precedence over truncated output and a
    // previously requested retry. Never restart an unsafe socket failure.
    var transportExit = Number(exitCode) === 74 || Number(exitCode) === 75
    var transportDisposition = transportExit ? mapWorkerExit(Number(exitCode)) : ""
    if (transportExit && teardownInProgress && transportDisposition === "latch"
        && teardownMode !== "shutdown" && teardownMode !== "disabled")
      teardownMode = "fatal"
    if (teardownInProgress) {
      finishTeardown()
      return
    }
    acceptingEvents = false
    resetInputQueue()
    if (transportExit) {
      if (transportDisposition === "restart") scheduleRestart()
      return
    }
    if (unterminatedOutput) {
      rejectedOutputCount += 1
      workerModel.rejectProtocol(
        "malformed_json", "The attention worker ended with an unterminated protocol line.")
      scheduleRestart()
      return
    }
    var disposition = mapWorkerExit(Number(exitCode))
    if (disposition === "restart") scheduleRestart()
  }

  function workerFailedToStart(child) {
    if (child !== workerProcess || !launchPending) return
    launchPending = false
    updateProcessCount(0)
    releaseWorker(child)
    if (teardownInProgress) finishTeardown()
    else workerModel.markStartFailure(
      "The trusted attention worker executable could not start.",
      "worker_executable_missing")
  }

  function rejectWorkerChunk(message) {
    outputBuffer = ""
    rejectedOutputCount += 1
    workerModel.rejectProtocol("malformed_json", message)
    beginTeardown("protocol_error")
  }

  function acceptWorkerChunk(child, data) {
    if (child !== workerProcess || child.generation !== activeGeneration) {
      staleProcessCallbacks += 1
      workerModel.staleLinesRejected += 1
      return
    }
    if (teardownInProgress) return
    var result = Bridge.consumeWorkerOutput(
      outputBuffer,
      data,
      maxOutputLineBytes,
      function(line) {
        acceptWorkerLine(child, line)
        return !teardownInProgress
      })
    outputBuffer = result.buffer
    if (result.ok) return
    if (result.code === "non_ascii") {
      rejectWorkerChunk("The attention worker emitted non-ASCII protocol framing.")
    } else if (result.code === "oversized_line") {
      rejectWorkerChunk("The attention worker emitted an oversized protocol line.")
    } else {
      rejectWorkerChunk("The attention worker emitted an empty protocol line.")
    }
  }

  function acceptWorkerLine(child, line) {
    if (child !== workerProcess || child.generation !== activeGeneration) {
      staleProcessCallbacks += 1
      workerModel.staleLinesRejected += 1
      return
    }
    if (teardownInProgress) return
    var text = String(line)
    if (text.length === 0 || Bridge.utf8ByteLength(text) + 1 > maxOutputLineBytes) {
      rejectedOutputCount += 1
      workerModel.rejectProtocol("malformed_json", "The attention worker emitted an oversized or empty line.")
      beginTeardown("protocol_error")
      return
    }
    if (!workerModel.acceptLine(text, child.generation)) {
      rejectedOutputCount += 1
      beginTeardown(workerModel.errorCode === "unsupported_protocol"
        ? "protocol_latch" : "protocol_error")
    } else if (workerModel.directTransportFailed && !workerModel.fatalError) {
      beginTeardown("restart")
    } else if (workerModel.fatalError) {
      beginTeardown("fatal")
    } else {
      var wasAccepting = acceptingEvents
      acceptingEvents = readyForWorker && !teardownInProgress && workerReady
      if (acceptingEvents && !wasAccepting) stabilityTimer.restart()
      else if (!acceptingEvents) stabilityTimer.stop()
    }
  }

  function enqueueMessage(message) {
    if (!acceptingEvents || !workerReady || teardownInProgress || workerProcess === null) return false
    var line = Bridge.serializeInput(message)
    if (line === null || !Bridge.enqueue(inputQueue, message, line)) {
      rejectedInputCount += 1
      workerModel.markSurfaceError("input_backpressure", "The bounded worker input queue overflowed.")
      beginTeardown("restart")
      return false
    }
    pendingInputCount = inputQueue.entries.length
    if (!inputPump.running) inputPump.start()
    return true
  }


  function pumpInput() {
    if (!acceptingEvents || !workerReady || teardownInProgress || workerProcess === null
        || !workerProcess.running || !workerProcess.stdinEnabled) {
      inputPump.stop()
      return
    }
    var entry = Bridge.take(inputQueue)
    pendingInputCount = inputQueue.entries.length
    if (entry === null) {
      inputPump.stop()
      return
    }
    workerProcess.write(entry.line)
    if (pendingInputCount === 0) inputPump.stop()
  }

  function beginTeardown(mode) {
    var requestedMode = String(mode || "shutdown")
    if (teardownInProgress) {
      if (requestedMode === "shutdown" || requestedMode === "disabled") teardownMode = requestedMode
      return
    }
    teardownInProgress = true
    teardownMode = requestedMode
    acceptingEvents = false
    restartTimer.stop()
    stabilityTimer.stop()
    resetInputQueue()

    var child = workerProcess
    if (child === null) {
      finishTeardown()
      return
    }
    if (!child.running) {
      child.running = false
      Qt.callLater(function() {
        if (root.workerProcess === child && root.teardownInProgress) root.forceFinalizeUnstarted(child)
      })
      return
    }

    var shutdownLine = Bridge.serializeInput({ type: "shutdown" })
    if (shutdownLine !== null && child.stdinEnabled) {
      child.write(shutdownLine)
      shutdownWriteCount += 1
    }
    child.stdinEnabled = false
    gracefulTimer.restart()
  }

  function forceFinalizeUnstarted(child) {
    if (child !== workerProcess) return
    launchPending = false
    updateProcessCount(0)
    releaseWorker(child)
    finishTeardown()
  }

  function finishTeardown() {
    var completedMode = teardownMode
    teardownInProgress = false
    teardownMode = "none"
    if (completedMode === "shutdown" || completedMode === "disabled")
      launchSocketCleanup()
    if (completedMode === "shutdown" || completedMode === "disabled") {
      shutdownRequested = completedMode === "shutdown" || shutdownRequested
      workerModel.markStopped()
      if (completedMode === "disabled" && readyForWorker) requestStart()
      return
    }
    if (completedMode === "fatal" || completedMode === "protocol_latch") return
    scheduleRestart()
  }
  function launchSocketCleanup() {
    if (cleanupLaunched || shell === null || launcherPath === "") return false
    cleanupLaunched = true
    var source = [
      "import QtQuick",
      "import Quickshell.Io",
      "Process {",
      "  property var requestedCommand: []",
      "  command: requestedCommand",
      "  running: false",
      "  stdout: SplitParser { splitMarker: \"\" }",
      "  stderr: SplitParser { splitMarker: \"\" }",
      "  onExited: destroy()",
      "  onRunningChanged: {",
      "    if (!running && requestedCommand.length > 0)",
      "      Qt.callLater(function() { if (!running) destroy() })",
      "  }",
      "}"
    ].join("\n")
    var cleanup = Qt.createQmlObject(source, shell, "ApertureSocketCleanup.qml")
    if (cleanup === null) return false
    cleanup.requestedCommand = [launcherPath, "--cleanup-owned-socket"]
    cleanup.running = true
    return true
  }

  function requestShutdown() {
    shutdownRequested = true
    beginTeardown("shutdown")
    return true
  }
  function requestResume() {
    if (!processEnabled || !pluginReady || teardownInProgress) return false
    shutdownRequested = false
    restartAttempt = 0
    restartTimer.stop()
    if (workerProcess !== null || launchPending) return true
    return requestStart()
  }


  function requestRestart() {
    if (shutdownRequested || !processEnabled) return false
    restartTimer.stop()
    if (workerProcess === null) return requestStart()
    beginTeardown("restart")
    return true
  }

  function statusJson() {
    return JSON.stringify({
      status: status,
      errorCode: errorCode,
      generation: activeGeneration,
      processId: workerProcess && workerProcess.running ? Number(workerProcess.processId) : null,
      activeProcessCount: activeProcessCount,
      maximumConcurrentProcesses: maximumConcurrentProcesses,
      processStartCount: processStartCount,
      processExitCount: processExitCount,
      processReferenceCount: processReferenceCount,
      activeTimerCount: activeTimerCount,
      pendingInputCount: pendingInputCount,
      rejectedInputCount: rejectedInputCount,
      rejectedOutputCount: rejectedOutputCount,
      pendingFocusRequestCount: pendingFocusRequestCount,
      staleFocusResultCount: staleFocusResultCount,
      maximumPendingFocusRequests: maxPendingFocusRequests,
      focusCompletedCount: focusCompletedCount,
      lastFocusResult: lastFocusResult,
      shutdownWriteCount: shutdownWriteCount,
      termSignalCount: termSignalCount,
      killSignalCount: killSignalCount,
      outputBufferedBytes: Bridge.utf8ByteLength(outputBuffer),
      staleProcessCallbacks: staleProcessCallbacks,
      staleLinesRejected: workerModel.staleLinesRejected,
      focusRequestAttemptCount: focusRequestAttemptCount,
      focusRequestRejectedCount: focusRequestRejectedCount,
      lastFocusRequestDisposition: lastFocusRequestDisposition,
      focusDiagnosticCount: focusDiagnosticCount,
      lastFocusDiagnostic: lastFocusDiagnostic,
      restartAttempt: restartAttempt,
      teardownInProgress: teardownInProgress,
      shutdownRequested: shutdownRequested
    })
  }

  onReadyForWorkerChanged: {
    if (readyForWorker) requestStart()
    else if (workerProcess !== null && !shutdownRequested)
      beginTeardown("disabled")
  }


  onProcessEnabledChanged: {
    if (processEnabled) {
      shutdownRequested = false
      requestStart()
    } else {
      beginTeardown("disabled")
    }
  }

  Component.onCompleted: requestStart()

  Component.onDestruction: {
    launchSocketCleanup()
    acceptingEvents = false
    restartTimer.stop()
    stabilityTimer.stop()
    inputPump.stop()
    gracefulTimer.stop()
    hardStopTimer.stop()
    resetInputQueue()
    if (workerProcess !== null && workerProcess.running) {
      var shutdownLine = Bridge.serializeInput({ type: "shutdown" })
      if (shutdownLine !== null && workerProcess.stdinEnabled) workerProcess.write(shutdownLine)
      workerProcess.stdinEnabled = false
      workerProcess.running = false
    }
  }


  Connections {
    target: root.pluginRegistry
    ignoreUnknownSignals: true

    function onPluginsChanged() {
      if (!root.manifest || !root.pluginRegistry
          || !root.pluginRegistry.installedPlugins) return
      var current = root.pluginRegistry.installedPlugins[String(root.manifest.id || "")]
      if (!current || !Array.isArray(current.kinds)
          || current.kinds.indexOf("service") === -1
          || !current.entryPoints || !current.entryPoints.service) {
        root.beginTeardown("disabled")
        return
      }
      if (String(current.__sourceDir || "") !== root.pluginDir) {
        root.beginTeardown("disabled")
        return
      }
      if (String(current.version || "") !== String(root.manifest.version || "")) {
        root.manifest = current
        root.requestRestart()
      }
    }
  }

  Timer {
    id: inputPump
    interval: 5
    repeat: true
    onTriggered: root.pumpInput()
  }

  Timer {
    id: restartTimer
    interval: 1000
    repeat: false
    onTriggered: root.requestStart()
  }

  Timer {
    id: stabilityTimer
    interval: 30000
    repeat: false
    onTriggered: root.restartAttempt = 0
  }

  Timer {
    id: gracefulTimer
    interval: 1500
    repeat: false
    onTriggered: {
      var child = root.workerProcess
      if (child === null || !child.running) return
      root.termSignalCount += 1
      child.signal(15)
      hardStopTimer.restart()
    }
  }

  Timer {
    id: hardStopTimer
    interval: 1500
    repeat: false
    onTriggered: {
      var child = root.workerProcess
      if (child === null || !child.running) return
      root.killSignalCount += 1
      child.signal(9)
    }
  }

  Component {
    id: workerComponent

    Process {
      id: childProcess
      property int generation: 0
      property bool released: false
      running: false

      stdout: SplitParser {
        splitMarker: ""
        onRead: function(data) { root.acceptWorkerChunk(childProcess, data) }
      }

      stderr: SplitParser {
        splitMarker: ""
        onRead: function(data) { root.acceptWorkerDiagnostic(data) }
      }

      onStarted: root.workerStarted(childProcess)

      onExited: function(exitCode, exitStatus) {
        root.workerExited(childProcess, exitCode, exitStatus)
      }

      onRunningChanged: {
        if (!running && root.workerProcess === childProcess && root.launchPending)
          Qt.callLater(function() { root.workerFailedToStart(childProcess) })
      }
    }
  }

  IpcHandler {
    target: root.ipcTarget

    function status(): string { return root.statusJson() }
    function shutdown(): string {
      root.requestShutdown()
      return root.statusJson()
    }
    function resume(): string {
      root.requestResume()
      return root.statusJson()
    }
    function restart(): string {
      root.requestRestart()
      return root.statusJson()
    }
  }
}
