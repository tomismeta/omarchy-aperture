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
  readonly property bool peekOpen: peekState.visible === true
  readonly property int peekDurationMs: 8000
  readonly property int peekCooldownMs: 30000


  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property color dim: root.alpha(foreground, 0.72)
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
  property string pendingFocusHandle: ""
  property string failedFocusHandle: ""
  property string failedFocusResult: ""
  property string deferredFocusFrameId: ""
  property string deferredFocusInteractionId: ""
  readonly property int peekFocusWaitMs: 3000
  readonly property var navigableFrames:
    Focus.navigableFrames(
      nowFrame, nextFrames, displayedAmbientFrames, failedFocusHandle)


  function alpha(color, opacity) {
    return Qt.rgba(color.r, color.g, color.b, opacity)
  }

  function navigationFor(frame) {
    return Focus.navigationFor(frame)
  }

  function isNavigableFrame(frame) {
    return Focus.isNavigableFrame(frame, failedFocusHandle)
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
  }

  function deferNowFocus(frame) {
    if (!Focus.canWaitForNavigation(
        frame, pendingFocusRequestId, queuedFocusHandle)) return false
    var selection = Focus.pendingSelectionFor(frame)
    if (selection === null) return false
    deferredFocusFrameId = selection.frameId
    deferredFocusInteractionId = selection.interactionId
    deferredFocusTimer.restart()
    Qt.callLater(resolveDeferredFocus)
    return true
  }

  function resolveDeferredFocus() {
    if (deferredFocusFrameId === "") return
    var frame = nowFrame
    if (!Focus.matchesInteraction(
        frame, deferredFocusFrameId, deferredFocusInteractionId)) {
      cancelDeferredFocus()
      return
    }
    if (navigationFor(frame) === null) return
    var focusDirectly = canFocusFrame(frame)
    cancelDeferredFocus()
    if (focusDirectly) {
      selectNavigationFrame(frame)
      focusFrame(frame)
      return
    }
    Qt.callLater(function() { root.open() })
  }

  function expireDeferredFocus() {
    var frameStillCurrent = Focus.matchesInteraction(
      nowFrame, deferredFocusFrameId, deferredFocusInteractionId)
    cancelDeferredFocus()
    if (frameStillCurrent) Qt.callLater(function() { root.open() })
  }

  function frameForIdentity(frameId, handle) {
    return Focus.findFrame(navigableFrames, frameId, handle)
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
  }

  function isPendingNowSelection(frame) {
    return selectedFocusHandle === "" && selectedInteractionId !== ""
      && Focus.matchesInteraction(
        frame, selectedFrameId, selectedInteractionId)
  }

  function selectInitialPanelFrame() {
    var selection = Focus.initialSelectionFor(
      nowFrame, navigableFrames, failedFocusHandle)
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
      navigableFrames, selectedFrameId, selectedFocusHandle)
  }


  function navigationIndexFor(frame) {
    if (!frame) return -1
    for (var index = 0; index < navigableFrames.length; index++)
      if (navigableFrames[index] === frame
          || (navigableFrames[index].id === frame.id
            && navigableFrames[index].version === frame.version)) return index
    return -1
  }

  function navigationStatusText(frame) {
    var navigation = navigationFor(frame)
    if (navigation === null) {
      if (isPendingNowSelection(frame) && deferredFocusTimer.running)
        return "Waiting for OMP session…"
      return "Session focus unavailable"
    }
    if (navigation.handle === queuedFocusHandle) return "Focusing OMP session…"
    if (navigation.handle === pendingFocusHandle) return "Focusing OMP session…"
    if (navigation.handle === failedFocusHandle)
      return failedFocusResult === "stale" ? "Session focus expired" : "Session focus unavailable"
    return "Focus OMP session"
  }

  function moveNavigationSelection(direction) {
    if (isPendingNowSelection(nowFrame)) {
      if (direction < 0) return
      for (var index = 0; index < navigableFrames.length; index++) {
        var frame = navigableFrames[index]
        if (frameIdentity(frame) === frameIdentity(nowFrame)) continue
        selectNavigationFrame(frame)
        Qt.callLater(revealSelectedFrame)
        return
      }
      return
    }
    var selection = Focus.moveSelection(
      navigableFrames, selectedFrameId, selectedFocusHandle, direction)
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

  function focusFrame(frame) {
    var navigation = navigationFor(frame)
    var frameId = frameIdentity(frame)
    if (navigation === null || frameId === "" || !canFocusFrame(frame)) return
    queuedFocusFrameId = frameId
    queuedFocusHandle = navigation.handle
    failedFocusHandle = ""
    failedFocusResult = ""
    close()
    focusDispatchTimer.restart()
  }

  function dispatchQueuedFocus() {
    var frameId = queuedFocusFrameId
    var handle = queuedFocusHandle
    queuedFocusFrameId = ""
    queuedFocusHandle = ""
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

  function frameMetaFor(frame, privacy) {
    return Presentation.frameMeta(frame, frameOrdinal(frame), privacy)
  }

  function frameTitleFor(frame, privacy) {
    return Presentation.frameTitle(frame, frameOrdinal(frame), privacy)
  }

  function frameSummaryFor(frame, privacy) {
    return Presentation.frameSummary(frame, privacy)
  }

  function frameMeta(frame) {
    return frameMetaFor(frame, panelPrivacyMode)
  }

  function frameTitle(frame) {
    return frameTitleFor(frame, panelPrivacyMode)
  }

  function frameSummary(frame) {
    return frameSummaryFor(frame, panelPrivacyMode)
  }

  function frameLine(frame) {
    return Presentation.frameLine(
      frame, frameOrdinal(frame), panelPrivacyMode)
  }

  function accessibleFrameName(lane, frame) {
    return Presentation.accessibleFrameName(
      lane, frame, frameOrdinal(frame), panelPrivacyMode)
  }

  function togglePrivacy() {
    if (opened) panelPrivacyOverride = !panelPrivacyOverride
  }

  function showFocusStatus(frame, hovered) {
    var navigation = navigationFor(frame)
    var handle = navigation === null ? "" : navigation.handle
    var selected = isPendingNowSelection(frame)
      || navigationIndexFor(frame) === selectedNavigationIndex
    return Presentation.showFocusStatus(
      selected,
      hovered,
      handle !== "" && (handle === queuedFocusHandle || handle === pendingFocusHandle),
      handle !== "" && handle === failedFocusHandle)
  }




  function calmDetail() {
    if (noSourceCoverage)
      return "Start or resume an OMP session to provide attention events."
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
    if (!presentsSnapshot) return postureText()
    return Math.max(0, Number(totals.now || 0)) + " NOW · "
      + Math.max(0, Number(totals.next || 0)) + " NEXT · "
      + Math.max(0, Number(totals.ambient || 0)) + " AMBIENT"
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
    if (errorStatus) return "Aperture · needs repair"
    if (noSourceCoverage)
      return "Aperture · NOW 0 · NEXT 0 · no OMP sessions connected"
    if (presentsSnapshot) {
      var nowCount = Math.max(0, Number(totals.now || 0))
      var nextCount = Math.max(0, Number(totals.next || 0))
      return "Aperture · NOW " + nowCount + " · NEXT " + nextCount
    }
    return "Aperture · " + postureText().toLowerCase()
  }

  function isFocusedPanelInstance() {
    var window = barButton.QsWindow.window
    var screen = window ? window.screen : null
    var focused = Hyprland.focusedMonitor
    return !!screen && !!focused && String(screen.name || "") !== ""
      && String(screen.name) === String(focused.name || "")
  }

  function closePeek() {
    peekState = Presentation.hidePeek(peekState)
    peekRevealTimer.stop()
  }

  function updateNowPeek() {
    var result = Presentation.transitionPeek(
      peekState,
      nowFrame,
      presentsSnapshot,
      opened,
      isFocusedPanelInstance())
    peekState = result.state
    if (!presentsSnapshot || nowFrame === null) {
      peekRevealTimer.stop()
      return
    }
    if (!result.revealStarted) return
    peekRevealTimer.restart()
    peekCooldownTimer.restart()
  }

  function activatePeek() {
    var frame = nowFrame
    if (!canActivatePeekSession(frame)) return
    closePeek()
    if (canFocusFrame(frame)) {
      focusFrame(frame)
      return
    }
    deferNowFocus(frame)
  }


  implicitWidth: barButton.implicitWidth
  implicitHeight: barButton.implicitHeight

  onOpenedChanged: {
    panelPrivacyOverride = false
    if (!opened) return
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
  onPresentsSnapshotChanged: Qt.callLater(updateNowPeek)
  onNextFramesChanged: reconcileFocusState()
  onDisplayedAmbientFramesChanged: reconcileFocusState()


  BarIconButton {
    id: barButton
    anchors.fill: parent
    bar: root.bar
    active: root.barAlertActive
    dimmed: root.barDimmed
    tooltipText: root.barTooltip()

    Accessible.name: root.barTooltip()
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
    onTriggered: root.peekState = Presentation.hidePeek(root.peekState)
  }

  Timer {
    id: peekCooldownTimer
    interval: root.peekCooldownMs
    repeat: false
    onTriggered: root.peekState = Presentation.endPeekCooldown(root.peekState)
  }

  Connections {
    target: root.attentionModel

    ignoreUnknownSignals: true
    function onFocusCompleted(requestId, handle, result) {
      root.completeFocus(requestId, handle, result)
    }
  }

  AttentionPeek {
    anchorItem: barButton
    bar: root.bar
    open: root.peekOpen
    canFocusSession: root.canActivatePeekSession(root.nowFrame)
    meta: root.frameMetaFor(root.nowFrame, root.privacyModeDefault)
    title: root.frameTitleFor(root.nowFrame, root.privacyModeDefault)
    summary: root.frameSummaryFor(root.nowFrame, root.privacyModeDefault)
    foreground: root.foreground
    dim: root.dim
    fontFamily: root.fontFamily
    onActivated: root.activatePeek()
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
      contentColumn.implicitHeight
        + (shortcutFooter.visible ? shortcutFooter.height + Style.space(6) : 0)
        + Style.space(8),
      Style.space(520))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent

      onMoveRequested: function(dx, dy) {
        if (dy !== 0) root.moveNavigationSelection(dy > 0 ? 1 : -1)
      }
      onActivateRequested: root.focusSelectedFrame()
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(text) {
        if (text === "p" || text === "P") root.togglePrivacy()
        else if (text === "a" || text === "A") root.toggleAmbientExpansion()
      }

      Column {
        id: panelLayout
        anchors.fill: parent
        spacing: Style.space(6)

      Flickable {
        id: panelFlick
        width: parent.width
        height: parent.height
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
          spacing: Style.space(8)

          PanelHero {
            width: parent.width
            title: "Aperture"
            meta: root.heroMeta()
            foreground: root.foreground
            fontFamily: root.fontFamily

            iconComponent: Component {
              ApertureMark {
                width: Style.font.display
                height: Style.font.display
                color: root.foreground
                pressureLevel: root.pressureLevel
                alert: root.errorStatus
              }
            }
          }



          BorderSurface {
            id: stateCard
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
          PanelSeparator {
            visible: root.presentsSnapshot
            foreground: root.foreground
          }

          BorderSurface {
            id: focusFailureCard
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
                text: "Could not focus OMP session"
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
            id: snapshotContent
            visible: root.presentsSnapshot
            width: parent.width
            spacing: Style.space(8)

            PanelSectionHeader {
              width: parent.width
              text: "NOW"
              foreground: root.foreground
              fontFamily: root.fontFamily
            }

            BorderSurface {
              id: calmCard
              visible: root.surfaceStatus === "calm"
              width: parent.width
              implicitHeight: calmColumn.implicitHeight + Style.space(10)
              color: Style.selectedFillFor(root.foreground, Color.accent)
              borderSpec: Border.none()
              radius: Style.cornerRadius
              Accessible.role: Accessible.StaticText
              Accessible.name: root.noSourceCoverage
                ? "No OMP sources connected" : "Nothing needs you now"
              Accessible.description: root.calmDetail()

              Column {
                id: calmColumn
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                anchors.leftMargin: Style.space(8)
                anchors.rightMargin: Style.space(8)
                spacing: Style.space(1)

                Text {
                  width: parent.width
                  text: root.noSourceCoverage
                    ? "No OMP sources connected" : "Nothing needs you now"
                  textFormat: Text.PlainText
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                  font.bold: true
                  wrapMode: Text.WordWrap
                }

                Text {
                  width: parent.width
                  text: root.calmDetail()
                  textFormat: Text.PlainText
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  wrapMode: Text.WordWrap
                }
              }
            }

            Item {
              id: nowCard
              visible: root.nowFrame !== null
              width: parent.width
              implicitHeight: Math.max(nowDot.implicitHeight, nowColumn.implicitHeight)
                + Style.space(8)
              property bool hovered: false
              readonly property var navigation: root.navigationFor(root.nowFrame)
              readonly property int navigationIndex:
                root.navigationIndexFor(root.nowFrame)
              readonly property bool selected:
                root.isPendingNowSelection(root.nowFrame)
                || (navigationIndex >= 0
                  && navigationIndex === root.selectedNavigationIndex)
              readonly property color rowFill: selected
                ? Style.hoverFillFor(root.foreground, Color.accent)
                : (hovered
                  ? Style.selectedFillFor(root.foreground, Color.accent)
                  : "transparent")
              readonly property var rowBorderSpec: selected
                ? Border.controlSpec("hover-cursor", root.foreground, Color.accent)
                : Border.none()
              Accessible.role: root.canActivatePanelNow(root.nowFrame)
                ? Accessible.Link : Accessible.StaticText
              Accessible.name: root.accessibleFrameName("NOW", root.nowFrame)
              Accessible.description: root.navigationStatusText(root.nowFrame)
              Accessible.onPressAction:
                if (root.canActivatePanelNow(root.nowFrame))
                  root.activatePanelNow(root.nowFrame)

              Rectangle {
                anchors.fill: parent
                color: nowCard.rowFill
                radius: Style.cornerRadius
                border.color: Border.canUseNative(nowCard.rowBorderSpec)
                  ? Border.color(nowCard.rowBorderSpec) : "transparent"
                border.width: Border.canUseNative(nowCard.rowBorderSpec)
                  ? Border.uniformWidth(nowCard.rowBorderSpec) : 0
              }

              Loader {
                anchors.fill: parent
                active: Border.needsOverlay(nowCard.rowBorderSpec)

                sourceComponent: BorderOverlay {
                  anchors.fill: parent
                  radius: Style.cornerRadius
                  borderSpec: nowCard.rowBorderSpec
                }
              }

              Row {
                id: nowRow
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                anchors.bottom: parent.bottom
                anchors.leftMargin: Style.space(6)
                anchors.rightMargin: Style.space(6)
                anchors.topMargin: Style.space(4)
                anchors.bottomMargin: Style.space(4)
                spacing: Style.space(8)

                Text {
                  id: nowDot
                  text: "●"
                  textFormat: Text.PlainText
                  color: Color.accent
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                }

                Column {
                  id: nowColumn
                  width: Math.max(0, parent.width - nowDot.implicitWidth - parent.spacing)
                  spacing: Style.space(3)

                  Item {
                    width: parent.width
                    implicitHeight: Math.max(nowMeta.implicitHeight, nowFocus.implicitHeight)

                    Text {
                      id: nowMeta
                      anchors.left: parent.left
                      width: Presentation.boundedMetadataWidth(
                        parent.width, nowFocus.width + Style.space(96))
                      anchors.verticalCenter: parent.verticalCenter
                      text: root.frameMeta(root.nowFrame)
                      textFormat: Text.PlainText
                      color: root.dim
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      elide: Text.ElideRight
                    }

                    Text {
                      id: nowFocus
                      visible: root.showFocusStatus(root.nowFrame, nowCard.hovered)
                      width: visible ? implicitWidth : 0
                      anchors.right: parent.right
                      anchors.verticalCenter: parent.verticalCenter
                      text: root.navigationStatusText(root.nowFrame).replace("OMP", "omp")
                      textFormat: Text.PlainText
                      color: root.canFocusFrame(root.nowFrame) ? Color.accent : root.dim
                      font.family: root.fontFamily
                      font.bold: nowCard.selected
                      font.pixelSize: Style.font.caption
                    }
                  }

                  Text {
                    width: parent.width
                    text: root.frameTitle(root.nowFrame)
                    textFormat: Text.PlainText
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                    elide: Text.ElideRight
                  }

                  Text {
                    visible: root.panelPrivacyMode
                      || (root.nowFrame && String(root.nowFrame.summary || "") !== "")
                    width: parent.width
                    text: root.frameSummary(root.nowFrame)
                    textFormat: Text.PlainText
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    wrapMode: Text.WordWrap
                    maximumLineCount: 2
                    elide: Text.ElideRight
                  }

                }
              }

              HoverHandler {
                cursorShape: root.canActivatePanelNow(root.nowFrame)
                  ? Qt.PointingHandCursor : Qt.ArrowCursor
                onHoveredChanged: nowCard.hovered = hovered
              }

              MouseArea {
                anchors.fill: parent
                enabled: root.canActivatePanelNow(root.nowFrame)
                cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                onClicked: root.activatePanelNow(root.nowFrame)
              }
            }


            Item {
              width: parent.width
              implicitHeight: Math.max(nextLabel.implicitHeight, nextText.implicitHeight)

              Text {
                id: nextLabel
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
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
                anchors.leftMargin: Style.space(10)
                anchors.verticalCenter: parent.verticalCenter
                text: root.nextSummary()
                textFormat: Text.PlainText
                color: root.alpha(root.foreground, 0.58)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                horizontalAlignment: Text.AlignRight
                elide: Text.ElideRight
              }
            }

            Text {
              id: nextClipped
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
              width: parent.width
              spacing: Style.space(1)

              Repeater {
                id: nextRepeater
                model: root.nextFrames

                Item {
                  id: nextCard
                  required property var modelData
                  property bool hovered: false
                  readonly property var navigation: root.navigationFor(modelData)
                  readonly property int navigationIndex: root.navigationIndexFor(modelData)
                  readonly property bool selected:
                    navigationIndex >= 0 && navigationIndex === root.selectedNavigationIndex
                  readonly property color rowFill: selected
                    ? Style.hoverFillFor(root.foreground, Color.accent)
                    : (hovered
                      ? Style.selectedFillFor(root.foreground, Color.accent)
                      : "transparent")
                  readonly property var rowBorderSpec: selected
                    ? Border.controlSpec("hover-cursor", root.foreground, Color.accent)
                    : Border.none()
                  width: nextRows.width
                  implicitHeight: Math.max(nextDot.implicitHeight, nextLine.implicitHeight)
                    + Style.space(8)
                  Accessible.role: root.canFocusFrame(modelData)
                    ? Accessible.Link : Accessible.StaticText
                  Accessible.name: root.accessibleFrameName("NEXT", modelData)
                  Accessible.description: root.navigationStatusText(modelData)
                  Accessible.onPressAction: if (root.canFocusFrame(modelData))
                    root.focusFrame(modelData)

                  Rectangle {
                    anchors.fill: parent
                    color: nextCard.rowFill
                    radius: Style.cornerRadius
                    border.color: Border.canUseNative(nextCard.rowBorderSpec)
                      ? Border.color(nextCard.rowBorderSpec) : "transparent"
                    border.width: Border.canUseNative(nextCard.rowBorderSpec)
                      ? Border.uniformWidth(nextCard.rowBorderSpec) : 0
                  }

                  Loader {
                    anchors.fill: parent
                    active: Border.needsOverlay(nextCard.rowBorderSpec)

                    sourceComponent: BorderOverlay {
                      anchors.fill: parent
                      radius: Style.cornerRadius
                      borderSpec: nextCard.rowBorderSpec
                    }
                  }

                  Row {
                    id: nextRow
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.top: parent.top
                    anchors.bottom: parent.bottom
                    anchors.leftMargin: Style.space(6)
                    anchors.rightMargin: Style.space(6)
                    anchors.topMargin: Style.space(4)
                    anchors.bottomMargin: Style.space(4)
                    spacing: Style.space(8)

                    Text {
                      id: nextDot
                      text: "○"
                      textFormat: Text.PlainText
                      color: root.dim
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                    }

                    Item {
                      id: nextLine
                      width: Math.max(
                        0, parent.width - nextDot.implicitWidth - parent.spacing)
                      implicitHeight: Math.max(
                        nextMeta.implicitHeight,
                        nextTitle.implicitHeight,
                        nextFocus.implicitHeight)

                      Text {
                        id: nextMeta
                        anchors.left: parent.left
                        width: Presentation.boundedMetadataWidth(
                          parent.width, nextFocus.width + Style.space(96))
                        anchors.verticalCenter: parent.verticalCenter
                        text: root.frameMeta(modelData)
                        textFormat: Text.PlainText
                        color: root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        elide: Text.ElideRight
                      }

                      Text {
                        id: nextTitle
                        anchors.left: nextMeta.right
                        anchors.right: nextFocus.left
                        anchors.leftMargin: Style.space(6)
                        anchors.rightMargin: Style.space(6)
                        anchors.verticalCenter: parent.verticalCenter
                        text: root.frameLine(modelData)
                        textFormat: Text.PlainText
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: nextCard.selected
                        elide: Text.ElideRight
                      }

                      Text {
                        id: nextFocus
                        visible: root.showFocusStatus(modelData, nextCard.hovered)
                        width: visible ? implicitWidth : 0
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        text: root.navigationStatusText(modelData).replace("OMP", "omp")
                        textFormat: Text.PlainText
                        color: root.canFocusFrame(modelData) ? Color.accent : root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        font.bold: nextCard.selected
                      }
                    }
                  }

                  HoverHandler {
                    cursorShape: root.canFocusFrame(modelData)
                      ? Qt.PointingHandCursor : Qt.ArrowCursor
                    onHoveredChanged: nextCard.hovered = hovered
                  }

                  MouseArea {
                    anchors.fill: parent
                    enabled: root.canFocusFrame(modelData)
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.focusFrame(modelData)
                  }
                }
              }
            }


            Item {
              id: ambientHeader
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

              Text {
                id: ambientLabel
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
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
                anchors.leftMargin: Style.space(10)
                anchors.verticalCenter: parent.verticalCenter
                text: root.ambientHeaderSummary()
                textFormat: Text.PlainText
                color: root.alpha(root.foreground, 0.58)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                horizontalAlignment: Text.AlignRight
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
              id: ambientClipped
              readonly property string message: root.ambientExpanded
                ? Presentation.clippedMessage(
                    "ambient items", root.totals.ambient, root.ambientFrames.length)
                : ""
              visible: message !== ""
              width: parent.width
              text: message
              textFormat: Text.PlainText
              color: root.alpha(root.foreground, 0.5)
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }

            Column {
              id: ambientRows
              width: parent.width
              spacing: Style.space(1)

              Repeater {
                id: ambientRepeater
                model: root.displayedAmbientFrames

                Item {
                  id: ambientCard
                  required property var modelData
                  property bool hovered: false
                  readonly property var navigation: root.navigationFor(modelData)
                  readonly property int navigationIndex:
                    root.navigationIndexFor(modelData)
                  readonly property bool selected:
                    navigationIndex >= 0
                    && navigationIndex === root.selectedNavigationIndex
                  readonly property color rowFill: selected
                    ? Style.hoverFillFor(root.foreground, Color.accent)
                    : (hovered
                      ? Style.selectedFillFor(root.foreground, Color.accent)
                      : "transparent")
                  readonly property var rowBorderSpec: selected
                    ? Border.controlSpec(
                      "hover-cursor", root.foreground, Color.accent)
                    : Border.none()
                  width: ambientRows.width
                  implicitHeight: Math.max(
                    ambientDot.implicitHeight, ambientLine.implicitHeight)
                    + Style.space(8)
                  Accessible.role: root.canFocusFrame(modelData)
                    ? Accessible.Link : Accessible.StaticText
                  Accessible.name: root.accessibleFrameName("AMBIENT", modelData)
                  Accessible.description: root.navigationStatusText(modelData)
                  Accessible.onPressAction: if (root.canFocusFrame(modelData))
                    root.focusFrame(modelData)

                  Rectangle {
                    anchors.fill: parent
                    color: ambientCard.rowFill
                    radius: Style.cornerRadius
                    border.color: Border.canUseNative(ambientCard.rowBorderSpec)
                      ? Border.color(ambientCard.rowBorderSpec) : "transparent"
                    border.width: Border.canUseNative(ambientCard.rowBorderSpec)
                      ? Border.uniformWidth(ambientCard.rowBorderSpec) : 0
                  }

                  Loader {
                    anchors.fill: parent
                    active: Border.needsOverlay(ambientCard.rowBorderSpec)

                    sourceComponent: BorderOverlay {
                      anchors.fill: parent
                      radius: Style.cornerRadius
                      borderSpec: ambientCard.rowBorderSpec
                    }
                  }

                  Row {
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.top: parent.top
                    anchors.bottom: parent.bottom
                    anchors.leftMargin: Style.space(6)
                    anchors.rightMargin: Style.space(6)
                    anchors.topMargin: Style.space(4)
                    anchors.bottomMargin: Style.space(4)
                    spacing: Style.space(8)

                    Text {
                      id: ambientDot
                      text: "○"
                      textFormat: Text.PlainText
                      color: root.dim
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                    }

                    Item {
                      id: ambientLine
                      width: Math.max(
                        0, parent.width - ambientDot.implicitWidth - parent.spacing)
                      implicitHeight: Math.max(
                        ambientMeta.implicitHeight,
                        ambientTitle.implicitHeight,
                        ambientFocus.implicitHeight)

                      Text {
                        id: ambientMeta
                        anchors.left: parent.left
                        width: Presentation.boundedMetadataWidth(
                          parent.width, ambientFocus.width + Style.space(96))
                        anchors.verticalCenter: parent.verticalCenter
                        text: root.frameMeta(modelData)
                        textFormat: Text.PlainText
                        color: root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        elide: Text.ElideRight
                      }

                      Text {
                        id: ambientTitle
                        anchors.left: ambientMeta.right
                        anchors.right: ambientFocus.left
                        anchors.leftMargin: Style.space(6)
                        anchors.rightMargin: Style.space(6)
                        anchors.verticalCenter: parent.verticalCenter
                        text: root.frameLine(modelData)
                        textFormat: Text.PlainText
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: ambientCard.selected
                        elide: Text.ElideRight
                      }

                      Text {
                        id: ambientFocus
                        visible:
                          root.showFocusStatus(modelData, ambientCard.hovered)
                        width: visible ? implicitWidth : 0
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        text: root.navigationStatusText(modelData)
                          .replace("OMP", "omp")
                        textFormat: Text.PlainText
                        color: root.canFocusFrame(modelData)
                          ? Color.accent : root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        font.bold: ambientCard.selected
                      }
                    }
                  }

                  HoverHandler {
                    cursorShape: root.canFocusFrame(modelData)
                      ? Qt.PointingHandCursor : Qt.ArrowCursor
                    onHoveredChanged: ambientCard.hovered = hovered
                  }

                  MouseArea {
                    anchors.fill: parent
                    enabled: root.canFocusFrame(modelData)
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.focusFrame(modelData)
                  }
                }
              }
            }
          }
        }
      }

        Item {
          id: shortcutFooter
          visible: root.presentsSnapshot
          width: parent.width
          height: visible ? Style.space(18) : 0

          Text {
            id: shortcutTips
            anchors.left: parent.left
            anchors.right: sourceStatus.left
            anchors.rightMargin: Style.space(6)
            anchors.verticalCenter: parent.verticalCenter
            text: Presentation.shortcutFooter(
              root.presentsSnapshot,
              root.navigableFrames.length > 0,
              root.ambientFrames.length > 3)
            textFormat: Text.PlainText
            color: root.alpha(root.foreground, 0.5)
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            horizontalAlignment: Text.AlignHCenter
            elide: Text.ElideRight
          }

          Row {
            id: sourceStatus
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(3)
            Accessible.role: Accessible.StaticText
            Accessible.name: String(Math.max(0, Number(root.totals.sources || 0)))
              + " connected sources"

            Text {
              text: "●"
              textFormat: Text.PlainText
              color: root.errorStatus
                ? root.urgent
                : (Number(root.totals.sources || 0) > 0 ? Color.accent : root.dim)
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }

            Text {
              text: String(Math.max(0, Number(root.totals.sources || 0)))
              textFormat: Text.PlainText
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
          }
        }

      }
    }
  }
}
