import QtQuick
import Quickshell.Io
import "../.." as Aperture
import "FixtureLogic.js" as Fixtures

// Development-only Omarchy entry point. The production manifest never loads
// this file and exposes no setting or environment switch that can select it.
Aperture.Panel {
  id: root
  moduleName: "aperture.fixtures"

  readonly property string scenario: String(setting("scenario", "calm"))
  privacyModeDefault: scenario === "privacy"
    || String(setting("privacyMode", "false")) === "true"
  property int fixtureGeneration: 0
  property int rapidVersion: 0
  property var rapidSnapshot: null

  Aperture.WorkerModel {
    id: fixtureModel
  }
  attentionModelOverride: fixtureModel

  function value(file) {
    return JSON.parse(file.text())
  }

  function feed(file) {
    attentionModel.acceptLine(file.text(), fixtureGeneration)
  }

  function feedValue(message) {
    attentionModel.acceptLine(JSON.stringify(message), fixtureGeneration)
  }

  function hierarchy() {
    return Fixtures.hierarchy(value(nowFixture), value(ambientFixture))
  }

  function resetPresentation() {
    panelPrivacyOverride = false
    ambientDisplay = "summary"
    rapidTimer.stop()
    rapidVersion = 0
    rapidSnapshot = null
    queuedFocusFrameId = ""
    queuedFocusHandle = ""
    pendingFocusHandle = ""
    failedFocusHandle = ""
    failedFocusResult = ""
  }

  function applyScenario() {
    if (!attentionModel) {
      applyTimer.restart()
      return
    }

    fixtureGeneration += 1
    attentionModel.reset(fixtureGeneration)
    resetPresentation()

    if (scenario === "start-failed") {
      attentionModel.markStartFailure(
        "The verified plugin worker could not start.", "worker_start_failed")
      return
    }

    if (scenario === "protocol-mismatch") {
      var incompatible = value(helloFixture)
      incompatible.capabilities.focusActivation = false
      feedValue(incompatible)
      return
    }

    feed(helloFixture)

    if (scenario === "malformed") {
      attentionModel.acceptLine("{malformed-json", fixtureGeneration)
      return
    }

    feed(restoringFixture)
    if (scenario === "connecting") return
    if (scenario === "disconnected") {
      attentionModel.markDisconnected(
        "fixture_disconnect", "The fixture attention worker stopped unexpectedly.")
      return
    }
    if (scenario === "degraded") {
      feed(degradedFixture)
      return
    }

    feed(readyFixture)
    if (scenario === "surface-error") {
      feed(errorFixture)
      return
    }

    if (scenario === "calm") {
      feed(calmFixture)
      return
    }
    if (scenario === "no-source") {
      var noSource = value(calmFixture)
      noSource.sources = []
      noSource.totals.sources = 0
      feedValue(noSource)
      return
    }
    if (scenario === "next-only") {
      feedValue(Fixtures.nextOnly(value(nowFixture), value(ambientFixture)))
      return
    }
    if (scenario === "non-navigable-now") {
      feedValue(Fixtures.nonNavigableNow(value(nowFixture), value(ambientFixture)))
      return
    }
    if (scenario === "minimal-frame") {
      feedValue(Fixtures.minimal(value(nowFixture)))
      return
    }
    if (scenario === "long-text") {
      feedValue(Fixtures.longText(value(nowFixture), value(ambientFixture)))
      return
    }
    if (scenario === "clipping") {
      feedValue(Fixtures.clipped(value(nowFixture), value(ambientFixture)))
      return
    }
    if (scenario === "rapid-versions") {
      rapidSnapshot = hierarchy()
      rapidVersion = 1
      rapidSnapshot.view.now.version = rapidVersion
      feedValue(rapidSnapshot)
      rapidTimer.restart()
      return
    }

    var snapshot = hierarchy()
    if (scenario === "out-of-order") {
      snapshot.sequence = 2
      feedValue(snapshot)
      feed(calmFixture)
      return
    }

    if (scenario === "ambient-expanded") ambientDisplay = "expanded"
    feedValue(snapshot)

    if (scenario === "pending-focus") {
      pendingFocusHandle = snapshot.view.now.navigation.handle
      selectNavigationFrame(snapshot.view.now)
    } else if (scenario === "keyboard-selection") {
      selectNavigationFrame(snapshot.view.next[0])
    }
  }

  onScenarioChanged: Qt.callLater(applyScenario)
  Component.onCompleted: Qt.callLater(applyScenario)

  Timer {
    id: applyTimer
    interval: 0
    onTriggered: root.applyScenario()
  }


  Timer {
    id: rapidTimer
    interval: 1000
    repeat: true
    onTriggered: {
      if (root.scenario !== "rapid-versions" || root.rapidVersion >= 10) {
        stop()
        return
      }
      root.rapidVersion += 1
      var update = JSON.parse(JSON.stringify(root.rapidSnapshot))
      update.sequence = root.rapidVersion
      update.view.now.version = root.rapidVersion
      update.view.now.title = "Approve the production migration · update "
        + root.rapidVersion
      root.rapidSnapshot = update
      root.feedValue(update)
      if (root.rapidVersion >= 10) stop()
    }
  }
  FileView {
    id: helloFixture
    path: Qt.resolvedUrl("worker-output/hello.json")
    blockLoading: true
    printErrors: false
  }

  FileView {
    id: restoringFixture
    path: Qt.resolvedUrl("worker-output/engine-restoring.json")
    blockLoading: true
    printErrors: false
  }

  FileView {
    id: readyFixture
    path: Qt.resolvedUrl("worker-output/engine-ready.json")
    blockLoading: true
    printErrors: false
  }

  FileView {
    id: degradedFixture
    path: Qt.resolvedUrl("worker-output/engine-degraded.json")
    blockLoading: true
    printErrors: false
  }

  FileView {
    id: errorFixture
    path: Qt.resolvedUrl("worker-output/error.json")
    blockLoading: true
    printErrors: false
  }

  FileView {
    id: calmFixture
    path: Qt.resolvedUrl("../omp-direct/snapshot-completion.json")
    blockLoading: true
    printErrors: false
  }

  FileView {
    id: nowFixture
    path: Qt.resolvedUrl("../omp-direct/snapshot-now-next.json")
    blockLoading: true
    printErrors: false
  }

  FileView {
    id: ambientFixture
    path: Qt.resolvedUrl("../omp-direct/snapshot-status.json")
    blockLoading: true
    printErrors: false
  }
}
