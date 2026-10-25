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
  property int productionStage: 0
  property int readinessStage: 0
  property var registry: null
  property var shellApi: null
  property var service: null
  property var currentManifest: initialManifest
  property string currentServiceUrl: Quickshell.env("APERTURE_SUPERVISOR_SERVICE_URL")
  readonly property var initialManifest: ({ id: "aperture-supervisor-test", version: "0.1.0",
    kinds: ["service"], entryPoints: { service: "Service.qml" } })
  Component {
    id: registryComponent
    QtObject {
      property var manifest: root.currentManifest
      property bool enabled: true
      readonly property var installedPlugins: {
        var current = ({})
        if (manifest) current[String(manifest.id)] = manifest
        return current
      }
      function isEnabled(id) { return enabled && manifest && id === manifest.id }
      function entryPointUrl(candidate, kind) {
        return candidate && candidate.id === "aperture-supervisor-test" && kind === "service"
          ? root.currentServiceUrl : ""
      }
    }
  }
  Component { id: shellApiComponent; QtObject {} }
  Component { id: serviceComponent; Aperture.Service {} }

  function createService() {
    shellApi = shellApiComponent.createObject(root)
    registry = registryComponent.createObject(root)
    service = serviceComponent.createObject(root, {
      shell: shellApi, manifest: currentManifest, pluginRegistry: registry
    })
    check(service !== null, "service construction failed")
  }

  function destroyService() {
    // Stock prunes scoped APIs before destroying the service.
    shellApi.destroy()
    shellApi = null
    registry.destroy()
    registry = null
    service.destroy()
    service = null
  }

  Connections {
    target: root.service
    function onErrorMessageChanged() {
      if (root.service === null || root.service.errorCode === "") return
      if (root.scenario === "protocol-retry" || root.scenario === "backpressure-retry"
          || root.scenario === "fatal-generic") {
        root.sawFailure = true
        root.diagnostic = root.service.errorMessage
      }
    }
  }


  Aperture.WorkerModel { id: isolatedModel }

  Component.onCompleted: {
    var hello = { type: "hello", protocolVersion: 5, packageVersion: "0.1.0",
      worker: "aperture-attention-engine", capabilities: { notificationInput: false,
        ompDirectInput: true, snapshots: true, responses: false, focusActivation: true,
        attentionDismissal: true } }
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
    if (scenario === "fatal-generic") {
      isolatedModel.acceptLine(JSON.stringify({ type: "error", code: "worker_failure",
        message: "retained fatal diagnostic", recoverable: false }), 3)
      check(!isolatedModel.presentsSnapshot && !isolatedModel.ready,
        "fatal generation retained a live snapshot")
      isolatedModel.acceptLine(JSON.stringify(ready), 3)
      isolatedModel.acceptLine(JSON.stringify({ type: "snapshot", sequence: 2, sources: [],
        totals: snapshot.totals, view: snapshot.view }), 3)
      check(isolatedModel.fatalError && isolatedModel.status === "surface_error"
        && isolatedModel.errorMessage === "retained fatal diagnostic"
        && !isolatedModel.presentsSnapshot, "trailing output revived a fatal generation")
    }
    if (!failed) createService()
  }

  function check(condition, message) {
    if (condition || failed) return
    failed = true
    console.error("APERTURE_SUPERVISOR_FAIL " + scenario + ": " + message)
    if (service !== null) {
      console.error(service.statusJson())
      service.requestShutdown()
    }
    Qt.quit()
  }

  function pass() {
    if (scenario === "production-overlap" && productionStage === 1) return
    if (scenario === "production-overlap" && !heartbeatStarted) {
      heartbeatStarted = true
      console.log("APERTURE_SUPERVISOR_READY production-overlap")
      heartbeat.running = true
      return
    }
    if (scenario === "production-overlap" && !heartbeatVerified) return
    if (scenario === "production-overlap" && productionStage === 0) {
      var previousPid = JSON.parse(service.statusJson()).processId
      productionStage = 1
      destroyService()
      cleanupCheck.command = [Quickshell.env("APERTURE_SUPERVISOR_NODE"),
        Quickshell.env("APERTURE_SUPERVISOR_HEARTBEAT_HELPER"),
        "--verify-stopped", String(previousPid)]
      cleanupCheck.running = true
      return
    }
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
    onExited: function(exitCode) {
      root.check(exitCode === 0, "replacement direct heartbeat or UID/mode verification failed")
      root.heartbeatVerified = exitCode === 0
      if (!root.failed) root.pass()
    }
  }

  Process {
    id: cleanupCheck
    stdout: StdioCollector {
      id: cleanupOutput
      onStreamFinished: console.log(cleanupOutput.text)
    }
    stderr: StdioCollector {
      id: cleanupError
      onStreamFinished: if (cleanupError.text !== "") console.error(cleanupError.text)
    }
    onExited: function(exitCode) {
      root.check(exitCode === 0, "destroyed service failed to release its worker and socket")
      if (root.failed) return
      root.productionStage = 2
      root.heartbeatStarted = false
      root.heartbeatVerified = false
      root.createService()
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
      // The replacement sequence retains production's cumulative retry backoff.
      root.check(Date.now() - root.startedAt
        < (root.scenario === "readiness" || root.scenario === "production-overlap" ? 25000 : 12000),
        "scenario timed out at stage " + root.readinessStage)
      if (service === null) return
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
        if (root.readinessStage === 1) {
          if (service.processReferenceCount !== 0) return
          root.check(service.activeProcessCount === 0 && !service.acceptingEvents,
            "disabled public registry retained a worker or admitted input")
          root.readinessStage = 2
          registry.enabled = true
          return
        }
        if (root.readinessStage === 5) {
          if (service.processReferenceCount !== 0) return
          root.readinessStage = 6
          root.currentServiceUrl = Quickshell.env("APERTURE_SUPERVISOR_SERVICE_URL")
          root.currentManifest = { id: "aperture-supervisor-test", version: "0.1.1",
            kinds: ["service"], entryPoints: { service: "Service.qml" } }
          return
        }
        if (service.status !== "calm" || service.teardownInProgress) return
        root.check(root.sawPreReadySnapshot, "no pre-ready phase observed")
        root.check(service.acceptingEvents, "ready did not admit input")
        if (root.readinessStage === 0) {
          root.check(service.enqueueMessage({ type: "focus.activate", requestId: "ready", handle: "AbCdEfGhIjKlMnOpQrStUvWxYz_12345" }), "ready focus rejected")
          root.readinessStage = 1
          registry.enabled = false
        } else if (root.readinessStage === 2) {
          root.check(service.processStartCount === 2, "re-enabling did not replace the stopped worker")
          root.readinessStage = 3
          root.currentManifest = { id: "aperture-supervisor-test", version: "0.1.1",
            kinds: ["service"], entryPoints: { service: "Service.qml" } }
        } else if (root.readinessStage === 3) {
          root.check(service.processStartCount === 3 && service.processExitCount === 2,
            "manifest replacement did not serialize the worker")
          root.readinessStage = 4
          root.currentServiceUrl = Quickshell.env("APERTURE_SUPERVISOR_RELOCATED_SERVICE_URL")
          root.currentManifest = { id: "aperture-supervisor-test", version: "0.1.1",
            kinds: ["service"], entryPoints: { service: "Service.qml" } }
        } else if (root.readinessStage === 4) {
          root.check(service.processStartCount === 4 && service.processExitCount === 3,
            "same-version source move did not replace the worker")
          root.readinessStage = 5
          service.requestRestart()
        } else if (root.readinessStage === 6) {
          root.check(service.processStartCount === 5 && service.processExitCount === 4,
            "source replacement during backoff did not launch the current source")
          root.readinessStage = 7
          var updated = { id: "aperture-supervisor-test", version: "0.1.2",
            kinds: ["service"], entryPoints: { service: "Service.qml" } }
          service.manifest = updated
          root.currentManifest = updated
        } else if (root.readinessStage === 7) {
          root.check(service.processStartCount === 6 && service.processExitCount === 5,
            "host manifest refresh hid the running generation's version")
          root.readinessStage = 8
          root.destroyService()
          Qt.callLater(root.createService)
        } else if (root.readinessStage === 8) {
          root.check(service.processStartCount === 1 && service.activeGeneration === 1,
            "re-enable did not create a fresh service instance")
          root.pass()
        }
        return
      }
      if (root.scenario === "terminal-update" || root.scenario === "terminal-update-shutdown") {
        var stopUpdated = root.scenario === "terminal-update-shutdown"
        if (service.teardownInProgress && service.teardownMode === "fatal"
            && root.currentManifest.version === "0.1.0") {
          root.currentManifest = { id: "aperture-supervisor-test", version: "0.1.1",
            kinds: ["service"], entryPoints: { service: "Service.qml" } }
          if (stopUpdated) service.requestShutdown()
        }
        if (root.currentManifest.version === "0.1.1" && stopUpdated) {
          if (!service.teardownInProgress && service.processReferenceCount === 0) {
            root.check(service.shutdownRequested && service.processStartCount === 1
              && service.activeTimerCount === 0 && service.status === "inactive",
              "source update overrode explicit shutdown")
            root.pass()
          }
        } else if (root.currentManifest.version === "0.1.1") {
          root.check(service.teardownInProgress || service.processReferenceCount !== 0,
            "source update during terminal teardown was lost")
          if (service.status === "calm") {
            root.check(service.activeGeneration === 2 && service.processStartCount === 2
              && service.processExitCount === 1, "terminal update did not serialize one replacement")
            root.pass()
          }
        }
        return
      }
      if (root.scenario === "protocol-retry" || root.scenario === "backpressure-retry"
          || root.scenario === "fatal-generic") {
        var expectedStatus = root.scenario === "protocol-retry" ? "protocol_error" : "surface_error"
        var expectedCode = root.scenario === "protocol-retry" ? "malformed_json"
          : root.scenario === "backpressure-retry" ? "input_backpressure" : "worker_failure"
        if (root.scenario === "backpressure-retry" && !root.sawFailure
            && service.status === "calm") {
          var accepted = true
          for (var queued = 0; queued < 1024 && accepted; queued++)
            accepted = service.enqueueMessage({ type: "focus.activate", requestId: "queued-" + queued,
              handle: "AbCdEfGhIjKlMnOpQrStUvWxYz_12345" })
          root.check(!accepted, "bounded input queue never rejected overload")
        }
        if (root.sawFailure && service.processReferenceCount === 0) {
          root.check(service.status === expectedStatus && service.errorCode === expectedCode
            && service.errorMessage === root.diagnostic && !service.presentsSnapshot,
            "stopped error generation lost its diagnostic or retained a live snapshot")
          root.check(service.restartAttempt === (root.scenario === "fatal-generic" ? 0 : 1),
            "error generation has the wrong restart disposition")
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
      if (root.scenario === "production-overlap" && root.productionStage === 2) {
        if (service.status === "calm") {
          root.check(service.activeGeneration === 1 && service.processStartCount === 1,
            "stock re-enable did not create one fresh worker")
          root.pass()
        }
        return
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
