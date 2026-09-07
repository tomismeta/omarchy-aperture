import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Hyprland
import qs.Commons
import qs.Ui
import "PanelFocusLogic.js" as Focus
import "PanelPresentationLogic.js" as Presentation

Panel {
  id: root
  moduleName: "aperture"
  manageIpc: false

  property var attentionModelOverride: null
  readonly property var attentionModel: attentionModelOverride
    ? attentionModelOverride
    : (bar && bar.shell ? bar.shell.serviceFor("aperture") : null)
  function setting(name, fallback) {
    var values = root.settings || ({})
    return values[name] !== undefined && values[name] !== null ? values[name] : fallback
  }

  property bool privacyModeDefault: String(setting("privacyMode", "false")) === "true"
  property string openShortcut: String(setting("openShortcut", "Super + A")).trim() || "Super + A"
  property bool panelPrivacyOverride: false
  readonly property bool panelPrivacyMode:
    Presentation.panelPrivacyEnabled(
      privacyModeDefault, panelPrivacyOverride, opened)
  property string ambientDisplay: {
    var value = String(setting("ambientDisplay", "summary"))
    return value === "expanded" ? "expanded" : "summary"
  }
  property int ambientExpansionOverride: -1
  readonly property bool ambientExpanded: ambientExpansionOverride >= 0
    ? ambientExpansionOverride === 1 : ambientDisplay === "expanded"
  property var peekState: Presentation.createPeekState()
  property bool peekReading: false
  property bool updatingPeek: false
  readonly property bool peekOpen: peekState.visible === true && !opened
  readonly property int peekDurationMs: 8000
  readonly property int peekLeaveGraceMs: 2000
  readonly property var peekCards: projectPeekCards()
  property var inspectionTarget: null
  readonly property var selectableFrames: presentsSnapshot
    ? (nowFrame ? [nowFrame] : []).concat(nextFrames).concat(displayedAmbientFrames) : []
  readonly property var inspectionFrames: opened ? selectableFrames : []
  readonly property var inspectedFrame: presentsSnapshot
    ? Presentation.inspectedFrame(inspectionFrames, inspectionTarget) : null
  readonly property bool inspectionOpen: opened && inspectedFrame !== null
  readonly property var inspectionCopy: Presentation.cardPresentation(
    inspectedFrame, frameOrdinal(inspectedFrame), panelPrivacyMode)
  readonly property var inspectionSections:
    Presentation.inspectionSections(inspectedFrame, panelPrivacyMode)
  property bool clearHeld: false
  property string dismissalMessage: ""


  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property color dim: root.alpha(foreground, 0.9)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family


  readonly property string surfaceStatus: attentionModel ? attentionModel.status : "connecting"
  readonly property bool presentsSnapshot: attentionModel ? attentionModel.presentsSnapshot : false
  readonly property var nowFrame: attentionModel ? attentionModel.nowFrame : null
  readonly property var nextFrames: attentionModel ? attentionModel.nextFrames : []
  readonly property var ambientFrames: attentionModel ? attentionModel.ambientFrames : []
  readonly property var displayedAmbientFrames: ambientExpanded
    ? ambientFrames : ambientFrames.slice(0, 3)
  readonly property var totals: attentionModel ? attentionModel.totals
    : ({ now: 0, next: 0, ambient: 0, sources: 0 })
  readonly property bool attentionActive: attentionModel ? attentionModel.hasNow : false
  readonly property int queuedAttentionCount: presentsSnapshot
    ? Math.max(0, Number(totals.next || 0)) : 0
  readonly property bool nextAttentionActive: queuedAttentionCount > 0
  readonly property bool barAlertActive: attentionActive || nextAttentionActive
  readonly property bool noSourceCoverage: presentsSnapshot && !attentionActive
    && Number(totals.sources || 0) === 0
  readonly property bool calmSnapshot: presentsSnapshot && !errorStatus
    && Number(totals.sources || 0) > 0
    && Number(totals.now || 0) === 0 && Number(totals.next || 0) === 0
    && Number(totals.ambient || 0) === 0
  readonly property bool errorStatus: surfaceStatus === "protocol_error"
    || surfaceStatus === "surface_incompatible" || surfaceStatus === "surface_error"
  readonly property bool barDimmed: surfaceStatus === "connecting"
    || surfaceStatus === "inactive" || surfaceStatus === "disconnected"
    || surfaceStatus === "start_failed" || noSourceCoverage
  readonly property int pressureLevel:
    presentsSnapshot ? Presentation.pressureLevel(totals) : 0
  readonly property color barBackground: bar ? bar.background : Color.bar.background
  readonly property var pressureRgb:
    Presentation.pressureColor(pressureLevel, barBackground, foreground, Color.accent)
  readonly property color pressureColor:
    Qt.rgba(pressureRgb.r, pressureRgb.g, pressureRgb.b, 1)
  readonly property color markColor: errorStatus ? urgent : pressureColor
  property string selectedFrameId: ""
  property string selectedFocusHandle: ""
  property string selectedInteractionId: ""
  readonly property int selectedNavigationIndex: selectedFrameIndex()
  property string pendingFocusRequestId: ""
  property string queuedFocusFrameId: ""
  property string queuedFocusHandle: ""
  property string queuedPeekIdentity: ""
  property string pendingFocusHandle: ""
  property string failedFocusHandle: ""
  property string failedFocusResult: ""
  property string deferredFocusFrameId: ""
  property string deferredFocusInteractionId: ""
  property bool deferredFocusIsPeek: false
  readonly property int peekFocusWaitMs: 3000


  function alpha(color, opacity) {
    return Qt.rgba(color.r, color.g, color.b, opacity)
  }

  function navigationFor(frame) {
    return Focus.navigationFor(frame)
  }

  function canFocusFrame(frame) {
    return Focus.canStartFocus(
      frame, failedFocusHandle, pendingFocusRequestId, queuedFocusHandle)
  }

  function canActivatePeekSession(frame) {
    return Focus.canActivatePeekSession(
      frame, failedFocusHandle, pendingFocusRequestId, queuedFocusHandle)
  }
  function frameIdentity(frame) {
    return Focus.frameIdentity(frame)
  }

  function cancelDeferredFocus() {
    deferredFocusTimer.stop()
    deferredFocusFrameId = ""
    deferredFocusInteractionId = ""
    deferredFocusIsPeek = false
  }

  function deferNowFocus(frame, fromPeek) {
    if (!Focus.canWaitForNavigation(
        frame, pendingFocusRequestId, queuedFocusHandle)) return false
    var selection = Focus.pendingSelectionFor(frame)
    if (selection === null) return false
    deferredFocusFrameId = selection.frameId
    deferredFocusInteractionId = selection.interactionId
    deferredFocusIsPeek = fromPeek === true
    deferredFocusTimer.restart()
    Qt.callLater(resolveDeferredFocus)
    return true
  }

  function deferredFocusFrame() {
    if (!presentsSnapshot) return null
    if (!deferredFocusIsPeek) return nowFrame
    return Presentation.resolvePeekFrame(peekSnapshot(),
      JSON.stringify([deferredFocusFrameId, deferredFocusInteractionId]))
  }

  function resolveDeferredFocus() {
    if (deferredFocusFrameId === "") return
    var frame = deferredFocusFrame()
    if (!Focus.matchesInteraction(
        frame, deferredFocusFrameId, deferredFocusInteractionId)) {
      cancelDeferredFocus()
      return
    }
    if (navigationFor(frame) === null) return
    var focusDirectly = canFocusFrame(frame)
    var fromPeek = deferredFocusIsPeek
    cancelDeferredFocus()
    if (focusDirectly) {
      selectNavigationFrame(frame)
      focusFrame(frame, fromPeek)
      return
    }
    Qt.callLater(function() { root.open() })
  }

  function expireDeferredFocus() {
    var frameStillCurrent = Focus.matchesInteraction(
      deferredFocusFrame(), deferredFocusFrameId, deferredFocusInteractionId)
    cancelDeferredFocus()
    if (frameStillCurrent) Qt.callLater(function() { root.open() })
  }

  function frameForIdentity(frameId, handle) {
    return Focus.findFrame(selectableFrames, frameId, handle)
  }

  function selectNavigationFrame(frame) {
    var selection = Focus.selectionFor(frame)
    selectedInteractionId = ""
    if (selection === null) {
      selectedFrameId = ""
      selectedFocusHandle = ""
      return
    }
    selectedFrameId = selection.frameId
    selectedFocusHandle = selection.handle
    if (frame === nowFrame && selection.handle === "")
      selectedInteractionId = Focus.interactionIdentity(frame)
  }

  function isPendingNowSelection(frame) {
    return selectedFocusHandle === "" && selectedInteractionId !== ""
      && Focus.matchesInteraction(
        frame, selectedFrameId, selectedInteractionId)
  }

  function selectInitialPanelFrame() {
    var selection = Focus.initialSelectionFor(
      nowFrame, selectableFrames)
    if (selection === null) {
      selectNavigationFrame(null)
      return
    }
    selectedFrameId = selection.frameId
    selectedFocusHandle = selection.handle
    selectedInteractionId = selection.interactionId
  }

  function selectedFrameIndex() {
    return Focus.selectionIndex(
      selectableFrames, selectedFrameId, selectedFocusHandle)
  }


  function navigationIndexFor(frame) {
    if (!frame) return -1
    for (var index = 0; index < selectableFrames.length; index++)
      if (selectableFrames[index] === frame
          || (selectableFrames[index].id === frame.id
            && selectableFrames[index].version === frame.version)) return index
    return -1
  }

  function navigationStatusText(frame) {
    var navigation = navigationFor(frame)
    if (navigation === null) {
      if (isPendingNowSelection(frame) && deferredFocusTimer.running)
        return "Waiting for OMP session…"
      return "Session unavailable"
    }
    if (navigation.handle === queuedFocusHandle) return "Opening OMP session…"
    if (navigation.handle === pendingFocusHandle) return "Opening OMP session…"
    if (navigation.handle === failedFocusHandle)
      return failedFocusResult === "stale" ? "Session link expired" : "Session unavailable"
    return "Open Session"
  }

  function moveNavigationSelection(direction) {
    if (isPendingNowSelection(nowFrame)) {
      if (direction < 0) return
      for (var index = 0; index < selectableFrames.length; index++) {
        var frame = selectableFrames[index]
        if (frameIdentity(frame) === frameIdentity(nowFrame)) continue
        selectNavigationFrame(frame)
        Qt.callLater(revealSelectedFrame)
        return
      }
      return
    }
    var selection = Focus.moveSelection(
      selectableFrames, selectedFrameId, selectedFocusHandle, direction)
    if (selection === null) {
      selectNavigationFrame(null)
      return
    }
    selectedFrameId = selection.frameId
    selectedFocusHandle = selection.handle
    selectedInteractionId = ""
    Qt.callLater(revealSelectedFrame)
  }

  function revealPanelItem(item) {
    if (!item || !item.visible || panelFlick.height <= 0) return
    var point = item.mapToItem(panelFlick.contentItem, 0, 0)
    var top = Number(point.y)
    var bottom = top + Number(item.height)
    var viewportTop = Number(panelFlick.contentY)
    var viewportBottom = viewportTop + Number(panelFlick.height)
    if (top < viewportTop)
      panelFlick.contentY = Math.max(0, top)
    else if (bottom > viewportBottom)
      panelFlick.contentY = Math.min(
        Math.max(0, panelFlick.contentHeight - panelFlick.height),
        bottom - panelFlick.height)
  }

  function revealSelectedFrame() {
    var selected = frameForIdentity(selectedFrameId, selectedFocusHandle)
    if (selected === null) return
    if (selected === nowFrame
        || (nowFrame && selected.id === nowFrame.id
          && selected.version === nowFrame.version)) {
      revealPanelItem(nowCard)
      return
    }
    for (var index = 0; index < nextFrames.length; index++) {
      var frame = nextFrames[index]
      if (selected === frame
          || (selected.id === frame.id && selected.version === frame.version)) {
        revealPanelItem(nextRepeater.itemAt(index))
        return
      }
    }
    for (var ambientIndex = 0;
        ambientIndex < displayedAmbientFrames.length; ambientIndex++) {
      var ambientFrame = displayedAmbientFrames[ambientIndex]
      if (selected === ambientFrame
          || (selected.id === ambientFrame.id
            && selected.version === ambientFrame.version)) {
        revealPanelItem(ambientRepeater.itemAt(ambientIndex))
        return
      }
    }
  }

  function reportFocusFailure(handle, result) {
    failedFocusHandle = String(handle || "")
    failedFocusResult = String(result || "missing")
    Qt.callLater(function() { root.open() })
  }

  function focusFrame(frame, fromPeek) {
    var navigation = navigationFor(frame)
    var frameId = frameIdentity(frame)
    if (navigation === null || frameId === "" || !canFocusFrame(frame)) return
    queuedFocusFrameId = frameId
    queuedFocusHandle = navigation.handle
    queuedPeekIdentity = fromPeek === true ? Presentation.peekIdentity(frame) : ""
    failedFocusHandle = ""
    failedFocusResult = ""
    close()
    focusDispatchTimer.restart()
  }

  function dispatchQueuedFocus() {
    var frameId = queuedFocusFrameId
    var handle = queuedFocusHandle
    var peekIdentity = queuedPeekIdentity
    queuedFocusFrameId = ""
    queuedFocusHandle = ""
    queuedPeekIdentity = ""
    if (peekIdentity !== "") {
      var exactFrame = Presentation.resolvePeekFrame(peekSnapshot(), peekIdentity)
      var exactNavigation = navigationFor(exactFrame)
      if (exactNavigation === null || exactNavigation.handle !== handle) {
        reportFocusFailure(handle, "stale")
        return
      }
    }
    if (frameForIdentity(frameId, handle) === null) {
      reportFocusFailure(handle, "stale")
      return
    }
    if (!attentionModel || typeof attentionModel.requestFocus !== "function") {
      reportFocusFailure(handle, "missing")
      return
    }
    var requestId = String(attentionModel.requestFocus(handle) || "")
    if (requestId === "") {
      if (String(attentionModel.lastFocusRequestDisposition || "") === "busy") {
        queuedFocusFrameId = frameId
        queuedFocusHandle = handle
        queuedPeekIdentity = peekIdentity
        return
      }
      reportFocusFailure(handle, "missing")
      return
    }
    pendingFocusRequestId = requestId
    pendingFocusHandle = handle
  }

  function canActivatePanelNow(frame) {
    return canFocusFrame(frame)
      || (isPendingNowSelection(frame)
        && Focus.canWaitForNavigation(
          frame, pendingFocusRequestId, queuedFocusHandle))
  }

  function activatePanelNow(frame) {
    if (canFocusFrame(frame)) {
      selectNavigationFrame(frame)
      focusFrame(frame)
      return
    }
    if (isPendingNowSelection(frame)) deferNowFocus(frame)
  }

  function focusSelectedFrame() {
    if (isPendingNowSelection(nowFrame)) {
      activatePanelNow(nowFrame)
      return
    }
    var frame = frameForIdentity(selectedFrameId, selectedFocusHandle)
    if (frame === null) return
    focusFrame(frame)
  }

  function completeFocus(requestId, handle, result) {
    if (String(requestId) !== pendingFocusRequestId
        || String(handle) !== pendingFocusHandle) {
      if (queuedFocusHandle !== "") focusDispatchTimer.restart()
      return
    }
    pendingFocusRequestId = ""
    pendingFocusHandle = ""
    if (result === "focused") return
    reportFocusFailure(handle, result)
  }

  function reconcileFocusState() {
    if (selectedInteractionId !== "") {
      if (!isPendingNowSelection(nowFrame)) {
        selectNavigationFrame(null)
      } else if (navigationFor(nowFrame) !== null) {
        selectNavigationFrame(nowFrame)
      }
    } else if (selectedFrameId !== ""
        && frameForIdentity(selectedFrameId, selectedFocusHandle) === null) {
      selectNavigationFrame(null)
    }
    if (opened && selectedFrameId === "" && selectableFrames.length > 0)
      selectInitialPanelFrame()
    if (failedFocusHandle === "") return
    var frames = nowFrame === null ? [] : [nowFrame]
    frames = frames.concat(nextFrames).concat(displayedAmbientFrames)
    for (var index = 0; index < frames.length; index++) {
      var navigation = navigationFor(frames[index])
      if (navigation !== null && navigation.handle === failedFocusHandle) return
    }
    failedFocusHandle = ""
    failedFocusResult = ""
  }


  function frameOrdinal(frame) {
    if (!frame) return 1
    if (nowFrame && (frame === nowFrame
        || (frame.id === nowFrame.id && frame.version === nowFrame.version)))
      return Presentation.frameOrdinal(true, nextFrames.length, "now", 0)
    for (var nextIndex = 0; nextIndex < nextFrames.length; nextIndex++)
      if (frame === nextFrames[nextIndex]
          || (frame.id === nextFrames[nextIndex].id
            && frame.version === nextFrames[nextIndex].version))
        return Presentation.frameOrdinal(
          nowFrame !== null, nextFrames.length, "next", nextIndex)
    for (var ambientIndex = 0; ambientIndex < ambientFrames.length; ambientIndex++)
      if (frame === ambientFrames[ambientIndex]
          || (frame.id === ambientFrames[ambientIndex].id
            && frame.version === ambientFrames[ambientIndex].version))
        return Presentation.frameOrdinal(
          nowFrame !== null, nextFrames.length, "ambient", ambientIndex)
    return 1
  }


  function togglePrivacy() {
    if (opened) panelPrivacyOverride = !panelPrivacyOverride
    inspectionFlick.contentY = 0
  }

  function inspectFrame(frame) {
    if (!opened || !presentsSnapshot) return
    dismissalMessage = ""
    selectNavigationFrame(frame)
    inspectionTarget = Presentation.inspectionTargetFor(frame)
    inspectionFlick.contentY = 0
    keyCatcher.forceActiveFocus()
  }

  function closeInspection() {
    inspectionTarget = null
    keyCatcher.forceActiveFocus()
    Qt.callLater(revealSelectedFrame)
  }

  function clearStaleInspection() {
    if (inspectedFrame === null && inspectionTarget !== null) closeInspection()
  }

  function toggleInspection() {
    if (inspectionOpen) {
      closeInspection()
      return
    }
    var frame = isPendingNowSelection(nowFrame)
      ? nowFrame : frameForIdentity(selectedFrameId, selectedFocusHandle)
    inspectFrame(frame || (inspectionFrames.length > 0 ? inspectionFrames[0] : null))
  }

  function moveInspection(direction) {
    var index = inspectionFrames.indexOf(inspectedFrame)
    var nextIndex = index + direction
    if (index >= 0 && nextIndex >= 0 && nextIndex < inspectionFrames.length)
      inspectFrame(inspectionFrames[nextIndex])
  }

  function dismissAttention() {
    dismissalMessage = ""
    if (!presentsSnapshot || !attentionModel) {
      dismissalMessage = "Attention clearing is unavailable."
      return
    }
    var queued = inspectionOpen
      ? typeof attentionModel.requestDismissItem === "function"
        && attentionModel.requestDismissItem(inspectedFrame)
      : typeof attentionModel.requestDismissAll === "function"
        && attentionModel.requestDismissAll()
    if (queued && inspectionOpen) closeInspection()
    if (!queued) dismissalMessage = "Attention clearing is unavailable or already pending."
  }

  function openPeekOverview(identity) {
    if (!peekOpen) return
    var frame = Presentation.resolvePeekFrame(peekSnapshot(), identity)
    open()
    if (frame) selectNavigationFrame(frame)
    Qt.callLater(revealSelectedFrame)
  }





  function calmDetail() {
    if (noSourceCoverage)
      return "If the bundled extension is not activated, run:\n~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp activate\nThen restart already-open OMP sessions. Otherwise, start or resume an eligible session."
    var queued = Number(totals.next || 0)
    if (queued > 0) return queued + " queued for later."
    return "Monitoring connected OMP sessions."
  }

  function nextSummary() {
    return Presentation.nextSummary(totals.next)
  }

  function ambientSummary() {
    return Presentation.ambientSummary(totals.ambient)
  }
  function ambientHeaderSummary() {
    var total = Math.max(0, Number(totals.ambient || 0))
    if (ambientFrames.length <= 3) return ambientSummary()
    return ambientExpanded
      ? total + " quiet · Collapse"
      : displayedAmbientFrames.length + " of " + total + " shown · Expand"
  }

  function toggleAmbientExpansion() {
    if (ambientFrames.length <= 3) return
    ambientExpansionOverride = ambientExpanded ? 0 : 1
    Qt.callLater(reconcileFocusState)
  }

  function postureText() {
    if (surfaceStatus === "attention") return "NEEDS ATTENTION"
    if (noSourceCoverage) return "NO SOURCES"
    if (surfaceStatus === "calm") return "CALM"
    if (surfaceStatus === "inactive") return "INACTIVE"
    if (surfaceStatus === "start_failed") return "START FAILED"
    if (surfaceStatus === "disconnected") return "DISCONNECTED"
    if (surfaceStatus === "surface_incompatible") return "SURFACE INCOMPATIBLE"
    if (surfaceStatus === "protocol_error") return "PROTOCOL ERROR"
    if (surfaceStatus === "surface_error") return "SURFACE ERROR"
    return "CONNECTING"
  }

  function heroMeta() {
    if (!presentsSnapshot) return ""
    var counts = []
    if (Number(totals.now || 0) > 0) counts.push(totals.now + " Now")
    if (Number(totals.next || 0) > 0) counts.push(totals.next + " Next")
    if (Number(totals.ambient || 0) > 0) counts.push(totals.ambient + " Ambient")
    return counts.join(" · ")
  }

  function stateTitle() {
    if (surfaceStatus === "start_failed") {
      if (attentionModel && attentionModel.errorCode === "payload_missing")
        return "Aperture payload is missing"
      if (attentionModel && attentionModel.errorCode === "payload_not_production")
        return "Aperture payload is not approved"
      if (attentionModel && attentionModel.errorCode === "payload_verification_failed")
        return "Aperture payload failed verification"
      return "OMP attention could not start"
    }
    if (surfaceStatus === "disconnected") return "OMP attention worker disconnected"
    if (surfaceStatus === "inactive") return "Aperture attention is stopped"
    if (surfaceStatus === "surface_incompatible") {
      if (attentionModel && attentionModel.errorCode === "node_missing")
        return "Node runtime is missing"
      if (attentionModel && attentionModel.errorCode === "node_incompatible")
        return "Node runtime is incompatible"
      return "Worker runtime unavailable"
    }
    if (surfaceStatus === "protocol_error") return "Worker protocol error"
    if (surfaceStatus === "surface_error") return "Aperture could not build the attention view"
    return "Starting OMP attention"
  }

  function disconnectedDescription() {
    return "The OMP attention worker is unavailable. The plugin will retry automatically."
  }

  function stateDescription() {
    if (surfaceStatus === "start_failed")
      return attentionModel && attentionModel.errorMessage !== ""
        ? attentionModel.errorMessage
        : "The verified plugin worker could not start. Reload the plugin after repairing the installation."
    if (surfaceStatus === "disconnected") return disconnectedDescription()
    if (surfaceStatus === "inactive")
      return "Attention monitoring is inactive. Resume the Aperture service before expecting new OMP events."
    if (surfaceStatus === "surface_incompatible")
      return attentionModel && attentionModel.errorMessage !== ""
        ? attentionModel.errorMessage
        : "This plugin worker is incompatible with the snapshot surface."
    if (surfaceStatus === "protocol_error") {
      if (attentionModel && attentionModel.errorCode === "malformed_json")
        return "Aperture sent unreadable surface data. The panel will retry automatically."
      return attentionModel && attentionModel.errorMessage !== ""
        ? attentionModel.errorMessage
        : "Aperture emitted invalid surface protocol data."
    }
    if (surfaceStatus === "surface_error")
      return attentionModel && attentionModel.errorMessage !== ""
        ? attentionModel.errorMessage
        : "A bounded surface snapshot could not be produced."
    return "Waiting for the surface handshake and a complete attention snapshot."
  }

  function stateColor() {
    return errorStatus ? urgent : dim
  }

  function barTooltip() {
    var status = errorStatus ? "Needs repair"
      : noSourceCoverage ? "No OMP sessions connected"
      : calmSnapshot ? "Nothing needs you now"
      : presentsSnapshot ? heroMeta() : postureText().toLowerCase()
    return "Aperture\n" + status + "\n" + openShortcut + " · Open Aperture"
  }

  function isFocusedPanelInstance() {
    var window = barButton.QsWindow.window
    var screen = window ? window.screen : null
    var focused = Hyprland.focusedMonitor
    return !!screen && !!focused && String(screen.name || "") !== ""
      && String(screen.name) === String(focused.name || "")
  }

  function peekSnapshot() {
    return {
      now: nowFrame, next: nextFrames, ambient: ambientFrames,
      presents: presentsSnapshot
    }
  }

  function projectPeekCards() {
    var snapshot = peekSnapshot()
    return peekState.cards.map(function(card) {
      var frame = Presentation.resolvePeekFrame(snapshot, card.identity)
      var availability = Presentation.peekCardAvailability(card, frame, presentsSnapshot)
      var canActivate = availability === "" && canActivatePeekSession(frame)
      var copy = Presentation.cardPresentation(card.frame, card.ordinal, privacyModeDefault)
      return {
        identity: card.identity,
        meta: copy.meta, title: copy.title, summary: copy.summary,
        checkout: copy.checkout, model: copy.model,
        canFocusSession: canActivate,
        availabilityMessage: availability === "unavailable" ? "Attention unavailable"
          : availability === "stale" ? "No longer current"
          : !canActivate ? "Session unavailable" : ""
      }
    })
  }

  function closePeek() {
    // Explicit dismissal consumes this presentation set, not worker attention.
    peekState = Presentation.transitionPeek(peekState, peekSnapshot(), {
      now: Date.now(), opened: true
    })
    peekRevealTimer.stop()
  }

  function setPeekReading(reading) {
    peekReading = reading
    // The signal can run inside peekOpen/reading binding evaluation.
    Qt.callLater(updateNowPeek)
  }

  function updateNowPeek(activatedIdentity) {
    if (updatingPeek) return
    updatingPeek = true
    peekState = Presentation.transitionPeek(peekState, peekSnapshot(), {
      now: Date.now(), opened: opened, canReveal: isFocusedPanelInstance(),
      reading: peekReading,
      activatedIdentity: activatedIdentity,
      duration: peekDurationMs, grace: peekLeaveGraceMs
    })
    peekRevealTimer.stop()
    if (peekState.visible && !peekState.reading) {
      peekRevealTimer.interval = Math.max(1, peekState.deadline - Date.now())
      peekRevealTimer.start()
    }
    updatingPeek = false
  }

  function activatePeek(identity) {
    if (!peekOpen) return
    var card = null
    for (var index = 0; index < peekState.cards.length; index++)
      if (peekState.cards[index].identity === identity) card = peekState.cards[index]
    if (card === null) return
    var frame = Presentation.resolvePeekFrame(peekSnapshot(), identity)
    if (Presentation.peekCardAvailability(card, frame, presentsSnapshot) !== ""
        || !canActivatePeekSession(frame)) return
    updateNowPeek(identity)
    if (canFocusFrame(frame)) {
      focusFrame(frame, true)
      return
    }
    deferNowFocus(frame, true)
  }


  implicitWidth: barButton.implicitWidth
  implicitHeight: barButton.implicitHeight

  onPrivacyModeDefaultChanged: panelPrivacyOverride = false
  onOpenedChanged: {
    panelPrivacyOverride = false
    clearHeld = false
    dismissalMessage = ""
    closeInspection()
    if (!opened) {
      Qt.callLater(updateNowPeek)
      return
    }
    cancelDeferredFocus()
    closePeek()
    panelFlick.contentY = 0
    selectInitialPanelFrame()
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }
  onNowFrameChanged: {
    reconcileFocusState()
    Qt.callLater(resolveDeferredFocus)
    Qt.callLater(updateNowPeek)
  }
  onPresentsSnapshotChanged: {
    Qt.callLater(resolveDeferredFocus)
    Qt.callLater(updateNowPeek)
  }
  onNextFramesChanged: {
    reconcileFocusState()
    Qt.callLater(resolveDeferredFocus)
    Qt.callLater(updateNowPeek)
  }
  onAmbientFramesChanged: Qt.callLater(updateNowPeek)
  onDisplayedAmbientFramesChanged: reconcileFocusState()
  onInspectedFrameChanged: {
    // inspectionOpen already hides stale content; clear the target outside its binding evaluation.
    if (inspectedFrame === null && inspectionTarget !== null)
      Qt.callLater(clearStaleInspection)
  }


  BarIconButton {
    id: barButton
    anchors.fill: parent
    bar: root.bar
    active: root.barAlertActive
    dimmed: root.barDimmed
    tooltipText: root.barTooltip()

    Accessible.name: root.barTooltip()
    Accessible.description: root.openShortcut + " · Open Aperture"
    iconComponent: Component {
      ApertureMark {
        color: root.markColor
        pressureLevel: root.pressureLevel
        alert: root.errorStatus
      }
    }

    onPressed: function(buttonCode) {
      if (buttonCode === Qt.LeftButton) root.toggle()
    }
  }

  Timer {
    id: focusDispatchTimer
    interval: 150
    repeat: false
    onTriggered: root.dispatchQueuedFocus()
  }

  Timer {
    id: deferredFocusTimer
    interval: root.peekFocusWaitMs
    repeat: false
    onTriggered: root.expireDeferredFocus()
  }

  Timer {
    id: peekRevealTimer
    interval: root.peekDurationMs
    repeat: false
    onTriggered: root.updateNowPeek()
  }


  Connections {
    target: root.attentionModel

    ignoreUnknownSignals: true
    function onFocusCompleted(requestId, handle, result) {
      root.completeFocus(requestId, handle, result)
    }
    function onAttentionDismissResult(result, count) {
      root.dismissalMessage = result === "stale"
        ? "Attention changed. Review the current items before clearing."
        : result === "failed" ? "Could not clear attention. Try again."
        : count > 0 ? "Attention cleared. Sessions keep running." : ""
    }
  }

  AttentionPeek {
    id: attentionPeek
    anchorItem: barButton
    bar: root.bar
    open: root.peekOpen
    cards: root.peekCards
    openShortcut: root.openShortcut
    foreground: root.foreground
    dim: root.dim
    fontFamily: root.fontFamily
    onReadingChanged: root.setPeekReading(reading)
    onActivated: function(identity) { root.activatePeek(identity) }
    onOverviewRequested: function(identity) { root.openPeekOverview(identity) }
  }


  component AttentionRow: Rectangle {
    id: row
    required property var frame
    required property string lane
    readonly property bool ambientLane: lane === "AMBIENT"
    readonly property var copy: Presentation.cardPresentation(
      frame, root.frameOrdinal(frame), root.panelPrivacyMode)
    readonly property bool canOpen: root.canFocusFrame(frame)
      || (lane === "NOW" && root.canActivatePanelNow(frame))
    readonly property int navigationIndex: root.navigationIndexFor(frame)
    readonly property bool selected: navigationIndex >= 0
      && navigationIndex === root.selectedNavigationIndex
    readonly property string navigationStatus: root.navigationStatusText(frame)
    readonly property bool actionVisible: rowHover.hovered || selected || openSession.activeFocus
    implicitHeight: rowCopy.implicitHeight + Style.space(18)
    color: selected ? Style.selectedFillFor(root.foreground, Color.accent)
      : rowHover.hovered ? Style.hoverFillFor(root.foreground, Color.accent) : "transparent"
    Accessible.role: Accessible.Button
    Accessible.name: lane + ". " + copy.meta + ". " + copy.title
      + (copy.checkout ? ". " + copy.checkout : "") + (copy.model ? ". " + copy.model : "")
    Accessible.description: "Inspect item"
    Accessible.onPressAction: root.inspectFrame(frame)

    function openSessionFrame() {
      if (!canOpen) return
      if (lane === "NOW") root.activatePanelNow(frame)
      else root.focusFrame(frame)
    }

    Rectangle {
      visible: row.selected
      anchors.left: parent.left
      anchors.top: parent.top
      anchors.bottom: parent.bottom
      width: Style.space(2)
      color: Color.accent
    }
    HoverHandler { id: rowHover; cursorShape: Qt.PointingHandCursor }
    MouseArea {
      anchors.fill: parent
      cursorShape: Qt.PointingHandCursor
      onClicked: function(mouse) {
        var point = openSession.mapFromItem(row, mouse.x, mouse.y)
        if (row.actionVisible && point.x >= 0 && point.y >= 0
            && point.x < openSession.width && point.y < openSession.height) return
        root.inspectFrame(row.frame)
      }
    }

    Column {
      id: rowCopy
      x: Style.space(8)
      y: Style.space(9)
      width: Math.max(0, row.width - Style.space(16))
      spacing: Style.space(3)

      Item {
        width: parent.width
        implicitHeight: Math.max(sessionName.implicitHeight, inlineTitle.implicitHeight)
        Text {
          id: sessionName
          anchors.left: parent.left
          anchors.right: inlineTitle.left
          anchors.rightMargin: Style.space(7)
          anchors.verticalCenter: parent.verticalCenter
          text: row.copy.meta
          textFormat: Text.PlainText
          color: row.ambientLane ? root.dim : root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          font.bold: !row.ambientLane
          elide: Text.ElideRight
        }
        Text {
          id: inlineTitle
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          width: Math.min(implicitWidth, parent.width * 0.45)
          text: row.copy.title
          textFormat: Text.PlainText
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }
      }
      Text {
        visible: row.copy.checkout !== ""
        width: parent.width
        text: row.copy.checkout
        textFormat: Text.PlainText
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        elide: Text.ElideRight
      }
      Item {
        width: parent.width
        implicitHeight: openSession.implicitHeight + Style.space(4)
        Text {
          anchors.left: parent.left
          anchors.right: openSession.left
          anchors.rightMargin: Style.space(8)
          anchors.verticalCenter: parent.verticalCenter
          text: row.copy.model
          textFormat: Text.PlainText
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }
        Button {
          id: openSession
          anchors.right: parent.right
          anchors.bottom: parent.bottom
          text: "Open Session"
          opacity: row.actionVisible ? 1 : 0
          enabled: row.actionVisible && row.canOpen
          bordered: true
          focusable: true
          foreground: row.canOpen ? root.foreground : root.dim
          fontFamily: root.fontFamily
          fontSize: Style.font.caption
          horizontalPadding: Style.space(5)
          verticalPadding: Style.space(2)
          tooltipText: row.navigationStatus === "Open Session" ? "" : row.navigationStatus
          Accessible.role: Accessible.Button
          Accessible.ignored: !row.actionVisible
          Accessible.name: "Open Session. " + row.copy.meta
          Accessible.description: row.navigationStatus
          Accessible.onPressAction: row.openSessionFrame()
          onClicked: row.openSessionFrame()
        }
      }
    }
  }

  component DetailButton: Button {
    bordered: true
    focusable: true
    foreground: enabled ? root.foreground : root.dim
    fontFamily: root.fontFamily
    fontSize: Style.font.caption
    horizontalPadding: Style.space(5)
    verticalPadding: Style.space(3)
    Accessible.role: Accessible.Button
    Accessible.name: text
    Accessible.onPressAction: if (enabled) clicked()
  }

  KeyboardPanel {
    id: panel
    anchorItem: barButton
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(400))
    contentHeight: panel.fittedContentHeight(
      (root.inspectionOpen ? inspectionColumn.implicitHeight : contentColumn.implicitHeight)
        + panelHeader.implicitHeight + Style.space(6)
        + (shortcutFooter.visible ? shortcutFooter.height + Style.space(6) : 0)
        + Style.space(8),
      Style.space(520))

    Item {
      id: keyCatcher
      anchors.fill: parent
      focus: true
      // Keep the raw event here: clear must reject repeats across Details → overview.
      // Focused native buttons consume Return/Space before events reach this parent.
      Keys.onPressed: function(event) {
        if (event.modifiers & (Qt.ControlModifier | Qt.AltModifier | Qt.MetaModifier)) return
        var key = event.key
        if (key === Qt.Key_C) {
          event.accepted = true
          if (event.isAutoRepeat || root.clearHeld) return
          root.clearHeld = true
          root.dismissAttention()
          return
        }
        if (key === Qt.Key_Escape) {
          if (root.inspectionOpen) root.closeInspection()
          else root.close()
        } else if (key === Qt.Key_Tab || key === Qt.Key_Backtab) {
          root.switchPanel((event.modifiers & Qt.ShiftModifier) || key === Qt.Key_Backtab ? -1 : 1)
        } else if (key === Qt.Key_Return || key === Qt.Key_Enter || key === Qt.Key_Space) {
          if (root.inspectionOpen) root.focusFrame(root.inspectedFrame)
          else root.focusSelectedFrame()
        } else if (key === Qt.Key_Left || key === Qt.Key_Right
            || event.text === "h" || event.text === "l") {
          if (root.inspectionOpen)
            root.moveInspection(key === Qt.Key_Right || event.text === "l" ? 1 : -1)
        } else if (key === Qt.Key_Up || key === Qt.Key_Down
            || event.text === "j" || event.text === "k") {
          var direction = key === Qt.Key_Down || event.text === "j" ? 1 : -1
          if (root.inspectionOpen) inspectionFlick.contentY = Math.max(0, Math.min(
            Math.max(0, inspectionFlick.contentHeight - inspectionFlick.height),
            inspectionFlick.contentY + direction * Style.space(40)))
          else root.moveNavigationSelection(direction)
        } else if (key === Qt.Key_P) root.togglePrivacy()
        else if (key === Qt.Key_D) root.toggleInspection()
        else if (key === Qt.Key_A && !root.inspectionOpen) root.toggleAmbientExpansion()
        else return
        event.accepted = true
      }
      Keys.onReleased: function(event) {
        if (event.key === Qt.Key_C && !event.isAutoRepeat) {
          root.clearHeld = false
          event.accepted = true
        }
      }

      Column {
        id: panelLayout
        anchors.fill: parent
        spacing: Style.space(6)

        Column {
          id: panelHeader
          width: parent.width
          spacing: Style.space(2)

          Item {
            visible: !root.inspectionOpen
            width: parent.width
            implicitHeight: Math.max(headerMark.height, headerTitle.implicitHeight)

            ApertureMark {
              id: headerMark
              anchors.left: parent.left
              anchors.verticalCenter: parent.verticalCenter
              width: Style.space(24)
              height: width
              color: root.foreground
              pressureLevel: root.pressureLevel
              alert: root.errorStatus
            }

            Text {
              id: headerTitle
              anchors.left: headerMark.right
              anchors.leftMargin: Style.space(8)
              anchors.right: privacyStatus.left
              anchors.verticalCenter: parent.verticalCenter
              text: "Aperture"
              textFormat: Text.PlainText
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
              font.bold: true
              elide: Text.ElideRight
            }
            Text {
              id: privacyStatus
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              text: root.panelPrivacyMode ? "Private"
                : root.panelPrivacyOverride ? "Panel revealed" : ""
              textFormat: Text.PlainText
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }

          }
          Item {
            id: detailsToolbar
            readonly property bool wrapped: width < 2 * Math.max(
              overviewButton.width, detailOpen.width) + detailsNavigation.width + Style.space(12)
            visible: root.inspectionOpen
            width: parent.width
            implicitHeight: Math.max(overviewButton.implicitHeight, detailOpen.implicitHeight)
              + (wrapped ? detailsNavigation.height + Style.space(6) : 0) + Style.space(14)
            DetailButton {
              id: overviewButton
              anchors.left: parent.left
              text: "← Overview"
              bordered: false
              onClicked: root.closeInspection()
            }
            Row {
              id: detailsNavigation
              anchors.horizontalCenter: parent.horizontalCenter
              y: detailsToolbar.wrapped
                ? Math.max(overviewButton.height, detailOpen.height) + Style.space(6)
                : (overviewButton.height - height) / 2
              spacing: Style.space(2)
              DetailButton {
                text: "‹"
                enabled: root.inspectionFrames.indexOf(root.inspectedFrame) > 0
                Accessible.name: "Previous item"
                onClicked: root.moveInspection(-1)
              }
              Text {
                anchors.verticalCenter: parent.verticalCenter
                text: (root.inspectionFrames.indexOf(root.inspectedFrame) + 1)
                  + "/" + root.inspectionFrames.length
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
              }
              DetailButton {
                text: "›"
                enabled: root.inspectionFrames.indexOf(root.inspectedFrame) >= 0
                  && root.inspectionFrames.indexOf(root.inspectedFrame) < root.inspectionFrames.length - 1
                Accessible.name: "Next item"
                onClicked: root.moveInspection(1)
              }
            }
            DetailButton {
              id: detailOpen
              anchors.right: parent.right
              text: "Open Session"
              enabled: root.canFocusFrame(root.inspectedFrame)
              tooltipText: root.navigationStatusText(root.inspectedFrame)
              onClicked: root.focusFrame(root.inspectedFrame)
            }
            Rectangle {
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.bottom: parent.bottom
              height: 1
              color: root.alpha(root.foreground, 0.18)
            }
          }

        }

      Flickable {
        id: panelFlick
        visible: !root.inspectionOpen
        width: parent.width
        height: parent.height
          - panelHeader.implicitHeight - panelLayout.spacing
          - (shortcutFooter.visible ? shortcutFooter.height + panelLayout.spacing : 0)
        contentWidth: width
        contentHeight: contentColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.VerticalFlick
        interactive: contentHeight > height
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

        Column {
          id: contentColumn
          width: panelFlick.width
          spacing: Style.space(12)




          BorderSurface {
            visible: !root.presentsSnapshot || root.errorStatus
            width: parent.width
            implicitHeight: stateColumn.implicitHeight + Style.space(16)
            color: root.alpha(root.stateColor(), 0.08)
            borderSpec: Border.flat(root.alpha(root.stateColor(), 0.38), Math.max(1, Style.normalBorderWidth))
            radius: Style.cornerRadius
            Accessible.role: Accessible.StaticText
            Accessible.name: root.stateTitle()
            Accessible.description: root.stateDescription()

            Column {
              id: stateColumn
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              anchors.leftMargin: Style.space(10)
              anchors.rightMargin: Style.space(10)
              spacing: Style.space(2)

              Text {
                width: parent.width
                text: root.stateTitle()
                textFormat: Text.PlainText
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                font.bold: true
                wrapMode: Text.WordWrap
              }

              Text {
                width: parent.width
                text: root.stateDescription()
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.WordWrap
              }
            }
          }

          BorderSurface {
            visible: root.failedFocusHandle !== ""
            width: parent.width
            implicitHeight: focusFailureColumn.implicitHeight + Style.space(12)
            color: root.alpha(root.urgent, 0.08)
            borderSpec: Border.flat(
              root.alpha(root.urgent, 0.38), Math.max(1, Style.normalBorderWidth))
            radius: Style.cornerRadius
            Accessible.role: Accessible.StaticText
            Accessible.name: "OMP session focus failed"
            Accessible.description: focusFailureDetail.text

            Column {
              id: focusFailureColumn
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              anchors.leftMargin: Style.space(8)
              anchors.rightMargin: Style.space(8)
              spacing: Style.space(2)

              Text {
                width: parent.width
                text: "Could not open OMP session"
                textFormat: Text.PlainText
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
                wrapMode: Text.WordWrap
              }

              Text {
                id: focusFailureDetail
                width: parent.width
                text: root.failedFocusResult === "stale"
                  ? "That exact focus target expired before activation."
                  : "That exact OMP pane is no longer available."
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                wrapMode: Text.WordWrap
              }
            }
          }



          Column {
            visible: root.presentsSnapshot
            width: parent.width
            spacing: Style.space(5)

            Text {
              visible: Number(root.totals.now || 0) > 0 || root.nowFrame !== null
              width: parent.width
              text: "NOW  " + Math.max(0, Number(root.totals.now || 0))
              textFormat: Text.PlainText
              color: Color.accent
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
              elide: Text.ElideRight
            }

            Column {
              visible: !root.errorStatus && (root.calmSnapshot || root.noSourceCoverage)
              width: parent.width
              spacing: Style.space(2)
              Accessible.role: Accessible.StaticText
              Accessible.name: calmTitle.text
              Accessible.description: root.calmDetail()

              Text {
                id: calmTitle
                width: parent.width
                text: root.noSourceCoverage
                  ? "No OMP sources connected" : "Nothing needs you now"
                textFormat: Text.PlainText
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                font.bold: true
                wrapMode: Text.Wrap
              }

              Text {
                width: parent.width
                text: root.calmDetail()
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.Wrap
              }
            }

            AttentionRow {
              id: nowCard
              visible: root.nowFrame !== null
              width: parent.width
              frame: root.nowFrame
              lane: "NOW"
            }

            Text {
              readonly property string message: Presentation.clippedMessage(
                "attention items", root.totals.now, root.nowFrame !== null ? 1 : 0)
              visible: message !== ""
              width: parent.width
              text: message
              textFormat: Text.PlainText
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }


            Item {
              visible: Number(root.totals.next || 0) > 0 || root.nextFrames.length > 0
              width: parent.width
              implicitHeight: Math.max(nextLabel.implicitHeight, nextText.implicitHeight)
                + Style.space(8)

              Text {
                id: nextLabel
                anchors.left: parent.left
                anchors.bottom: parent.bottom
                text: "NEXT"
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
              }

              Text {
                id: nextText
                anchors.left: nextLabel.right
                anchors.right: parent.right
                anchors.leftMargin: Style.space(8)
                anchors.bottom: parent.bottom
                text: root.nextSummary()
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                horizontalAlignment: Text.AlignLeft
                elide: Text.ElideRight
              }
            }

            Text {
              readonly property string message:
                Presentation.clippedMessage(
                  "queued items", root.totals.next, root.nextFrames.length)
              visible: message !== ""
              width: parent.width
              text: message
              textFormat: Text.PlainText
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }


            Column {
              id: nextRows
              visible: root.nextFrames.length > 0
              width: parent.width
              spacing: Style.space(5)

              Repeater {
                id: nextRepeater
                model: root.nextFrames

                AttentionRow {
                  required property var modelData
                  width: nextRows.width
                  frame: modelData
                  lane: "NEXT"
                }
              }
            }


            Item {
              id: ambientHeader
              visible: root.totals.ambient > 0
              readonly property bool expandable: root.ambientFrames.length > 3
              Accessible.role: expandable
                ? Accessible.Button : Accessible.StaticText
              Accessible.name: expandable
                ? (root.ambientExpanded ? "Collapse AMBIENT" : "Expand AMBIENT")
                : "AMBIENT"
              Accessible.onPressAction: if (expandable)
                root.toggleAmbientExpansion()
              width: parent.width
              implicitHeight: Math.max(ambientLabel.implicitHeight, ambientText.implicitHeight)
                + Style.space(18)

              Rectangle {
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                height: 1
                color: root.alpha(root.foreground, 0.18)
              }
              Text {
                id: ambientLabel
                anchors.left: parent.left
                anchors.bottom: parent.bottom
                text: "AMBIENT"
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
              }

              Text {
                id: ambientText
                anchors.left: ambientLabel.right
                anchors.right: parent.right
                anchors.leftMargin: Style.space(8)
                anchors.bottom: parent.bottom
                text: root.ambientHeaderSummary()
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                horizontalAlignment: Text.AlignLeft
                elide: Text.ElideRight
              }

              HoverHandler {
                cursorShape: ambientHeader.expandable
                  ? Qt.PointingHandCursor : Qt.ArrowCursor
              }

              MouseArea {
                anchors.fill: parent
                enabled: ambientHeader.expandable
                cursorShape: Qt.PointingHandCursor
                onClicked: root.toggleAmbientExpansion()
              }
            }

            Text {
              readonly property string message: Presentation.clippedMessage(
                "ambient items", root.totals.ambient, root.ambientFrames.length)
              visible: message !== ""
              width: parent.width
              text: message
              textFormat: Text.PlainText
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }

            Column {
              id: ambientRows
              visible: root.displayedAmbientFrames.length > 0
              width: parent.width
              spacing: Style.space(1)

              Repeater {
                id: ambientRepeater
                model: root.displayedAmbientFrames

                AttentionRow {
                  required property var modelData
                  width: ambientRows.width
                  frame: modelData
                  lane: "AMBIENT"
                }
              }
            }
          }
        }
      }

        Flickable {
          id: inspectionFlick
          objectName: "inspectionFlick"
          visible: root.inspectionOpen
          width: parent.width
          height: panelFlick.height
          contentWidth: width
          contentHeight: inspectionColumn.implicitHeight
          clip: true
          boundsBehavior: Flickable.StopAtBounds
          flickableDirection: Flickable.VerticalFlick
          interactive: contentHeight > height
          ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

          Column {
            id: inspectionColumn
            width: parent.width
            spacing: Style.space(8)

            Text {
              visible: root.panelPrivacyOverride && !root.panelPrivacyMode
              width: parent.width
              text: "Panel revealed · notifications stay private"
              textFormat: Text.PlainText
              color: Color.accent
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              wrapMode: Text.Wrap
            }
            Text {
              width: parent.width
              text: root.inspectionCopy.meta
              textFormat: Text.PlainText
              wrapMode: Text.Wrap
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
              font.bold: true
              Accessible.role: Accessible.StaticText
              Accessible.name: text
            }
            Text {
              width: parent.width
              text: root.inspectionCopy.title
              textFormat: Text.PlainText
              wrapMode: Text.Wrap
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
            }
            Text {
              visible: !root.panelPrivacyMode && text !== ""
              width: parent.width
              topPadding: Style.space(4)
              bottomPadding: Style.space(6)
              text: root.panelPrivacyMode ? ""
                : Presentation.frameSummary(root.inspectedFrame, false)
              textFormat: Text.PlainText
              wrapMode: Text.Wrap
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
            }
            Text {
              visible: root.panelPrivacyMode
              width: parent.width
              text: "Session text and metadata are hidden."
              textFormat: Text.PlainText
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
              wrapMode: Text.Wrap
            }
            DetailButton {
              visible: root.panelPrivacyMode || root.panelPrivacyOverride
              text: root.panelPrivacyMode ? "Reveal panel only" : "Hide again"
              onClicked: root.togglePrivacy()
            }
            Repeater {
              model: root.inspectionSections
              Column {
                id: factSection
                required property var modelData
                width: inspectionColumn.width
                spacing: Style.space(8)
                Text {
                  width: parent.width
                  topPadding: Style.space(9)
                  text: factSection.modelData.label.toUpperCase()
                  textFormat: Text.PlainText
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                }
                Repeater {
                  model: factSection.modelData.items
                  Item {
                    id: fact
                    required property var modelData
                    width: factSection.width
                    implicitHeight: Math.max(factLabel.implicitHeight, factValue.implicitHeight)
                    Text {
                      id: factLabel
                      width: Math.min(Style.space(88), parent.width * 0.3)
                      text: fact.modelData.label
                      textFormat: Text.PlainText
                      wrapMode: Text.Wrap
                      color: root.dim
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                    }
                    Text {
                      id: factValue
                      anchors.left: factLabel.right
                      anchors.leftMargin: Style.space(10)
                      anchors.right: parent.right
                      text: fact.modelData.value
                      textFormat: Text.PlainText
                      wrapMode: Text.Wrap
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                    }
                  }
                }
              }
            }
          }
        }

        Column {
          id: shortcutFooter
          width: parent.width
          spacing: Style.space(8)
          Rectangle {
            width: parent.width
            height: 1
            color: root.alpha(root.foreground, 0.18)
          }
          Text {
            visible: root.dismissalMessage !== ""
            width: parent.width
            text: root.dismissalMessage
            textFormat: Text.PlainText
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.Wrap
            Accessible.role: Accessible.StaticText
            Accessible.name: text
          }

          Text {
            id: shortcutTips
            width: parent.width
            text: root.inspectionOpen
              ? "←→ browse · Enter open · C clear item · Esc overview"
              : root.inspectionFrames.length === 0 ? "Esc"
              : Presentation.shortcutFooter(
              root.presentsSnapshot,
              root.ambientFrames.length > 3)
            textFormat: Text.PlainText
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            horizontalAlignment: Text.AlignLeft
            wrapMode: Text.Wrap
          }

        }

      }
    }
  }
}
