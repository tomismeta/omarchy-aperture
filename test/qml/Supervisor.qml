import QtQuick
import Quickshell
import Quickshell.Io
import "." as Aperture

ShellRoot {
  id: root
  property string scenario: Quickshell.env("APERTURE_SUPERVISOR_SCENARIO") || "readiness"
  property bool retryExpected: scenario === "contention" || scenario === "exit75" || scenario === "production-overlap"
  property bool failed: false
  property bool sawPreReadySnapshot: false
  property bool sawFailure: false
  property bool sawTeardown: false
  property double failureTime: 0
  property double startedAt: Date.now()
  property string diagnostic: ""
  property bool heartbeatStarted: false
  property bool heartbeatVerified: false
  QtObject {
    id: registry
    function isEnabled(id) { return true }
  }


  Aperture.WorkerModel { id: isolatedModel }

  Component.onCompleted: {
    var hello = { type: "hello", protocolVersion: 4, packageVersion: "0.1.0",
      worker: "aperture-attention-engine", capabilities: { notificationInput: false,
        ompDirectInput: true, snapshots: true, responses: false, focusActivation: true } }
    var ready = { type: "engine", state: "ready", acceptedSources: 0 }
    var snapshot = { type: "snapshot", sequence: 1, sources: [],
      totals: { now: 0, next: 0, ambient: 0, sources: 0 },
      view: { now: null, next: [], ambient: [] } }
    for (var index = 0; index < 2; index++) {
      isolatedModel.reset(index + 1)
      isolatedModel.acceptLine(JSON.stringify(hello), index + 1)
      isolatedModel.acceptLine(JSON.stringify(snapshot), index + 1)
      check(isolatedModel.status === "connecting" && !isolatedModel.presentsSnapshot,
        "model exposed pre-ready snapshot")
      isolatedModel.acceptLine(JSON.stringify(ready), index + 1)
      check(isolatedModel.status === "calm", "model did not publish retained snapshot at ready")
      isolatedModel.acceptLine(JSON.stringify({ type: "error",
        code: "direct_transport_unavailable", message: "retained diagnostic",
        recoverable: index === 0 }), index + 1)
      isolatedModel.acceptLine(JSON.stringify(ready), index + 1)
      isolatedModel.acceptLine(JSON.stringify(snapshot), index + 1)
      check(isolatedModel.status === "surface_error" && !isolatedModel.ready
        && !isolatedModel.presentsSnapshot && isolatedModel.errorMessage === "retained diagnostic"
        && isolatedModel.fatalError === (index === 1),
        "model allowed trailing output to clear terminal transport failure")
    }
    isolatedModel.reset(3)
    check(!isolatedModel.acceptLine(JSON.stringify(ready), 2), "model accepted stale generation")
    isolatedModel.acceptLine(JSON.stringify(hello), 3)
    isolatedModel.acceptLine(JSON.stringify({ type: "error", code: "corrupt_state_recovered",
      message: "Recovered state", recoverable: true }), 3)
    isolatedModel.acceptLine(JSON.stringify(ready), 3)
    isolatedModel.acceptLine(JSON.stringify(snapshot), 3)
    check(isolatedModel.ready && isolatedModel.status === "calm",
      "unrelated recoverable warning prevented ready")
  }
  Aperture.Service {
    id: service
    shell: root
    manifest: ({ id: "aperture-supervisor-test", __sourceDir: Quickshell.env("APERTURE_SUPERVISOR_PLUGIN_DIR"), version: "0.1.0" })
    pluginRegistry: registry
  }

  function check(condition, message) {
    if (condition || failed) return
    failed = true
    console.error("APERTURE_SUPERVISOR_FAIL " + scenario + ": " + message)
    service.requestShutdown()
    Qt.quit()
  }

  function pass() {
    if (scenario === "production-overlap" && !heartbeatStarted) {
      heartbeatStarted = true
      console.log("APERTURE_SUPERVISOR_READY production-overlap")
      heartbeat.running = true
      return
    }
    if (scenario === "production-overlap" && !heartbeatVerified) return
    console.log("APERTURE_SUPERVISOR_PASS " + scenario)
    service.requestShutdown()
    poll.stop()
    finish.start()
  }

  Process {
    id: heartbeat
    command: [Quickshell.env("APERTURE_SUPERVISOR_NODE"),
      Quickshell.env("APERTURE_SUPERVISOR_HEARTBEAT_HELPER")]
    stdout: StdioCollector {
      id: heartbeatOutput
      onStreamFinished: console.log(heartbeatOutput.text)
    }
    stderr: StdioCollector {
      id: heartbeatError
      onStreamFinished: console.error(heartbeatError.text)
    }
    onExited: function(exitCode, exitStatus) {
      root.check(exitCode === 0, "replacement direct heartbeat or UID/mode verification failed")
      root.heartbeatVerified = exitCode === 0
      if (!root.failed) root.pass()
    }
  }

  Timer {
    id: finish
    interval: 20
    repeat: true
    onTriggered: {
      if (service.processReferenceCount === 0) Qt.quit()
    }
  }

  Timer {
    id: poll
    interval: 20
    repeat: true
    running: true
    onTriggered: {
      root.check(Date.now() - root.startedAt < 12000, "scenario timed out")
      root.check(service.maximumConcurrentProcesses <= 1, "overlapping child workers")
      if (root.failed) return
      if (!service.workerReady) {
        root.check(!service.acceptingEvents, "input admitted before ready")
        root.check(!service.enqueueMessage({ type: "focus.activate", requestId: "premature", handle: "AbCdEfGhIjKlMnOpQrStUvWxYz_12345" }), "pre-ready focus queued")
        root.check(service.status !== "calm" && service.status !== "attention", "pre-ready snapshot presented as healthy")
        root.check(!service.presentsSnapshot, "snapshot presented before ready")
      }
      if (root.scenario === "readiness") {
        if (service.status === "connecting" && service.processStartCount === 1)
          root.sawPreReadySnapshot = true
        if (service.status === "calm") {
          root.check(root.sawPreReadySnapshot, "no pre-ready phase observed")
          root.check(service.acceptingEvents, "ready did not admit input")
          root.check(service.enqueueMessage({ type: "focus.activate", requestId: "ready", handle: "AbCdEfGhIjKlMnOpQrStUvWxYz_12345" }), "ready focus rejected")
          root.pass()
        }
        return
      }
      if (service.errorCode === "direct_transport_unavailable") {
        if (!root.sawFailure) {
          root.sawFailure = true
          root.failureTime = Date.now()
          root.diagnostic = service.errorMessage
          console.log("APERTURE_SUPERVISOR_TRANSPORT_FAILURE " + root.scenario)
        }
        root.check(service.status === "surface_error", "transport failure status cleared")
        root.check(service.errorMessage === root.diagnostic, "exit replaced transport diagnostic")
        if (service.teardownInProgress) {
          root.sawTeardown = true
          root.check(service.teardownMode === (root.retryExpected ? "restart" : "fatal"), "wrong transport teardown disposition")
          root.check(service.activeGeneration === 1, "replacement launched before old child exit")
          root.check(!service.requestStart(), "start bypassed serialized teardown")
        }
      }
      if (root.retryExpected && service.status === "calm") {
        root.check(root.sawFailure, "replacement became ready without observed transport failure")
        root.check(service.activeGeneration >= 2 && service.processExitCount >= 1, "failed generation was not replaced")
        if (root.scenario === "contention") root.check(root.sawTeardown, "error record did not trigger immediate teardown")
        root.check(service.acceptingEvents, "replacement ready did not admit input")
        root.pass()
      } else if (!root.retryExpected && root.sawFailure && Date.now() - root.failureTime > 1700) {
        root.check(service.activeGeneration === 1 && service.processReferenceCount === 0, "fatal transport exit restarted")
        root.check(service.restartAttempt === 0, "fatal transport exit scheduled backoff")
        root.check(service.errorCode === "direct_transport_unavailable" && service.errorMessage === root.diagnostic, "fatal diagnostic lost")
        if (root.scenario !== "exit74") root.check(root.sawTeardown, "fatal error did not trigger immediate teardown")
        root.pass()
      }
    }
  }
}
