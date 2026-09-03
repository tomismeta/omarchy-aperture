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

  property bool privacyModeDefault: String(setting("privacyMode", "true")) === "true"
  property bool panelPrivacyOverride: false
  readonly property bool panelPrivacyMode:
    Presentation.panelPrivacyEnabled(
      privacyModeDefault, panelPrivacyOverride, opened)
  property string ambientDisplay: {
    var value = String(setting("ambientDisplay", "summary"))
    return value === "expanded" ? "expanded" : "summary"
  }
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
  readonly property var totals: attentionModel ? attentionModel.totals
    : ({ now: 0, next: 0, ambient: 0, sources: 0 })
  readonly property bool attentionActive: attentionModel ? attentionModel.hasNow : false
  readonly property int queuedAttentionCount: presentsSnapshot
    ? Math.max(0, Number(totals.next || 0)) : 0
  readonly property bool nextAttentionActive: queuedAttentionCount > 0
  readonly property bool barAlertActive: attentionActive
  readonly property bool noSourceCoverage: presentsSnapshot && !attentionActive
    && Number(totals.sources || 0) === 0
  readonly property bool errorStatus: surfaceStatus === "protocol_error"
    || surfaceStatus === "surface_incompatible" || surfaceStatus === "surface_error"
  readonly property bool barDimmed: surfaceStatus === "connecting"
    || surfaceStatus === "disconnected" || surfaceStatus === "start_failed"
    || noSourceCoverage
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
  readonly property int selectedNavigationIndex: selectedFrameIndex()
  property string pendingFocusRequestId: ""
  property string queuedFocusFrameId: ""
  property string queuedFocusHandle: ""
  property string pendingFocusHandle: ""
  property string failedFocusHandle: ""
  property string failedFocusResult: ""
  readonly property var navigableFrames:
    Focus.navigableFrames(nowFrame, nextFrames, failedFocusHandle)


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
    return isNavigableFrame(frame) && pendingFocusRequestId === ""
      && queuedFocusHandle === ""
  }
  function frameIdentity(frame) {
    return Focus.frameIdentity(frame)
  }

  function frameForIdentity(frameId, handle) {
    return Focus.findFrame(navigableFrames, frameId, handle)
  }

  function selectNavigationFrame(frame) {
    var selection = Focus.selectionFor(frame)
    if (selection === null) {
      selectedFrameId = ""
      selectedFocusHandle = ""
      return
    }
    selectedFrameId = selection.frameId
    selectedFocusHandle = selection.handle
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
    if (navigation === null) return "Session focus unavailable"
    if (navigation.handle === queuedFocusHandle) return "Focusing OMP session…"
    if (navigation.handle === pendingFocusHandle) return "Focusing OMP session…"
    if (navigation.handle === failedFocusHandle)
      return failedFocusResult === "stale" ? "Session focus expired" : "Session focus unavailable"
    return "Focus OMP session"
  }

  function moveNavigationSelection(direction) {
    var selection = Focus.moveSelection(
      navigableFrames, selectedFrameId, selectedFocusHandle, direction)
    if (selection === null) {
      selectNavigationFrame(null)
      return
    }
    selectedFrameId = selection.frameId
    selectedFocusHandle = selection.handle
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

  function focusSelectedFrame() {
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
    if (selectedFrameId !== ""
        && frameForIdentity(selectedFrameId, selectedFocusHandle) === null)
      selectNavigationFrame(null)
    if (failedFocusHandle === "") return
    var frames = nowFrame === null ? [] : [nowFrame]
    frames = frames.concat(nextFrames)
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

  function togglePrivacy() {
    if (opened) panelPrivacyOverride = !panelPrivacyOverride
  }

  function showFocusStatus(frame, hovered) {
    var navigation = navigationFor(frame)
    var handle = navigation === null ? "" : navigation.handle
    var selected = navigationIndexFor(frame) === selectedNavigationIndex
    return Presentation.showFocusStatus(
      selected,
      hovered,
      handle !== "" && (handle === queuedFocusHandle || handle === pendingFocusHandle),
      handle !== "" && handle === failedFocusHandle)
  }




  function calmDetail() {
    if (noSourceCoverage) return "Ready; waiting for an OMP session."
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

  function postureText() {
    if (surfaceStatus === "attention") return "NEEDS ATTENTION"
    if (noSourceCoverage) return "NO SOURCES"
    if (surfaceStatus === "calm") return "CALM"
    if (surfaceStatus === "start_failed") return "START FAILED"
    if (surfaceStatus === "disconnected") return "DISCONNECTED"
    if (surfaceStatus === "surface_incompatible") return "SURFACE INCOMPATIBLE"
    if (surfaceStatus === "protocol_error") return "PROTOCOL ERROR"
    if (surfaceStatus === "surface_error") return "SURFACE ERROR"
    return "CONNECTING"
  }

  function heroMeta() {
    if (presentsSnapshot) return Presentation.canonicalHeaderSummary(totals)
    return postureText()
  }

  function stateTitle() {
    if (surfaceStatus === "start_failed") return "OMP attention could not start"
    if (surfaceStatus === "disconnected") return "OMP attention worker disconnected"
    if (surfaceStatus === "surface_incompatible") return "Worker runtime unavailable"
    if (surfaceStatus === "protocol_error") return "Worker protocol error"
    if (surfaceStatus === "surface_error") return "Aperture could not build the attention view"
    return "Starting OMP attention"
  }

  function disconnectedDescription() {
    return "The OMP attention worker is unavailable. The plugin will retry automatically."
  }

  function stateDescription() {
    if (surfaceStatus === "start_failed")
      return "The verified plugin worker is missing or could not start. Reload the plugin after repairing the installation."
    if (surfaceStatus === "disconnected") return disconnectedDescription()
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
    if (attentionActive) return "Aperture · needs attention now"
    if (nextAttentionActive)
      return "Aperture · " + queuedAttentionCount + " queued"
    if (noSourceCoverage) return "Aperture · no OMP sessions connected"
    if (surfaceStatus === "calm") return "Aperture · no current interruption"
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
    closePeek()
    Qt.callLater(function() { root.open() })
  }


  implicitWidth: barButton.implicitWidth
  implicitHeight: barButton.implicitHeight

  onOpenedChanged: {
    panelPrivacyOverride = false
    if (!opened) return
    closePeek()
    panelFlick.contentY = 0
    selectNavigationFrame(navigableFrames.length > 0 ? navigableFrames[0] : null)
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }
  onNowFrameChanged: {
    reconcileFocusState()
    Qt.callLater(updateNowPeek)
  }
  onPresentsSnapshotChanged: Qt.callLater(updateNowPeek)
  onNextFramesChanged: reconcileFocusState()


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
    meta: root.frameMetaFor(root.nowFrame, root.privacyModeDefault)
    title: root.frameTitleFor(root.nowFrame, root.privacyModeDefault)
    summary: root.frameSummaryFor(root.nowFrame, root.privacyModeDefault)
    foreground: root.foreground
    dim: root.dim
    fontFamily: root.fontFamily
    onActivated: root.activatePeek()
    onDismissed: root.closePeek()
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
                ? "No active OMP sessions" : "Nothing needs you now"
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
                    ? "No active OMP sessions" : "Nothing needs you now"
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

            BorderSurface {
              id: nowCard
              visible: root.nowFrame !== null
              width: parent.width
              implicitHeight: nowColumn.implicitHeight + Style.space(12)
              property bool hovered: false
              readonly property bool selected:
                navigationIndex >= 0 && navigationIndex === root.selectedNavigationIndex
              color: selected
                ? Style.hoverFillFor(root.foreground, Color.accent)
                : Style.selectedFillFor(root.foreground, Color.accent)
              borderSpec: selected
                ? Border.controlSpec("hover-cursor", root.foreground, Color.accent)
                : Border.none()
              radius: Style.cornerRadius
              readonly property var navigation: root.navigationFor(root.nowFrame)
              readonly property int navigationIndex: root.navigationIndexFor(root.nowFrame)
              Accessible.role: root.canFocusFrame(root.nowFrame)
                ? Accessible.Link : Accessible.StaticText
              Accessible.name: root.frameTitle(root.nowFrame)
              Accessible.description: root.navigationStatusText(root.nowFrame)
              Accessible.onPressAction: if (root.canFocusFrame(root.nowFrame))
                root.focusFrame(root.nowFrame)

              Column {
                id: nowColumn
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                anchors.leftMargin: Style.space(8)
                anchors.rightMargin: Style.space(8)
                spacing: Style.space(3)

                Text {
                  width: parent.width
                  text: root.frameMeta(root.nowFrame)
                  textFormat: Text.PlainText
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  elide: Text.ElideRight
                }

                Text {
                  width: parent.width
                  text: root.frameTitle(root.nowFrame)
                  textFormat: Text.PlainText
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.title
                  font.bold: true
                  wrapMode: Text.WordWrap
                  maximumLineCount: 2
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


                Text {
                  visible: root.showFocusStatus(root.nowFrame, nowCard.hovered)
                  width: parent.width
                  text: root.navigationStatusText(root.nowFrame)
                  textFormat: Text.PlainText
                  color: root.canFocusFrame(root.nowFrame) ? Color.accent : root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  font.bold: nowCard.navigationIndex === root.selectedNavigationIndex
                }
              }

              HoverHandler {
                cursorShape: root.canFocusFrame(root.nowFrame)
                  ? Qt.PointingHandCursor : Qt.ArrowCursor
                onHoveredChanged: nowCard.hovered = hovered
              }

              MouseArea {
                anchors.fill: parent
                enabled: root.canFocusFrame(root.nowFrame)
                cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                onClicked: root.focusFrame(root.nowFrame)
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


            Repeater {
              id: nextRepeater
              model: root.nextFrames

              BorderSurface {
                id: nextCard
                required property var modelData
                property bool hovered: false
                readonly property var navigation: root.navigationFor(modelData)
                readonly property int navigationIndex: root.navigationIndexFor(modelData)
                readonly property bool selected:
                  navigationIndex >= 0 && navigationIndex === root.selectedNavigationIndex
                width: snapshotContent.width
                implicitHeight: nextColumn.implicitHeight + Style.space(8)
                color: selected
                  ? Style.hoverFillFor(root.foreground, Color.accent)
                  : "transparent"
                borderSpec: selected
                  ? Border.controlSpec("hover-cursor", root.foreground, Color.accent)
                  : Border.none()
                radius: Style.cornerRadius
                Accessible.role: root.canFocusFrame(modelData)
                  ? Accessible.Link : Accessible.StaticText
                Accessible.name: root.frameTitle(modelData)
                Accessible.description: root.navigationStatusText(modelData)
                Accessible.onPressAction: if (root.canFocusFrame(modelData))
                  root.focusFrame(modelData)

                Column {
                  id: nextColumn
                  anchors.left: parent.left
                  anchors.right: parent.right
                  anchors.verticalCenter: parent.verticalCenter
                  anchors.leftMargin: Style.space(8)
                  anchors.rightMargin: Style.space(8)
                  spacing: Style.space(1)

                  Item {
                    width: parent.width
                    implicitHeight: Math.max(nextMeta.implicitHeight, nextFocus.implicitHeight)

                    Text {
                      id: nextMeta
                      anchors.left: parent.left
                      anchors.right: nextFocus.left
                      anchors.rightMargin: Style.space(6)
                      anchors.verticalCenter: parent.verticalCenter
                      text: root.frameMeta(modelData)
                      textFormat: Text.PlainText
                      color: root.dim
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      elide: Text.ElideRight
                    }

                    Text {
                      id: nextFocus
                      visible: root.showFocusStatus(modelData, nextCard.hovered)
                      width: visible ? implicitWidth : 0
                      anchors.right: parent.right
                      anchors.verticalCenter: parent.verticalCenter
                      text: root.navigationStatusText(modelData)
                      textFormat: Text.PlainText
                      color: root.canFocusFrame(modelData) ? Color.accent : root.dim
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      font.bold: nextCard.selected
                    }
                  }

                  Text {
                    width: parent.width
                    text: root.frameLine(modelData)
                    textFormat: Text.PlainText
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    font.bold: nextCard.selected
                    elide: Text.ElideRight
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


            Item {
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
                text: root.ambientSummary()
                textFormat: Text.PlainText
                color: root.alpha(root.foreground, 0.58)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                horizontalAlignment: Text.AlignRight
                elide: Text.ElideRight
              }
            }

            Text {
              id: ambientClipped
              readonly property string message: root.ambientDisplay === "expanded"
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

            Repeater {
              model: root.ambientDisplay === "expanded" ? root.ambientFrames : []

              BorderSurface {
                required property var modelData
                width: snapshotContent.width
                implicitHeight: ambientColumn.implicitHeight + Style.space(6)
                color: "transparent"
                borderSpec: Border.none()
                radius: Style.cornerRadius
                Accessible.role: Accessible.StaticText
                Accessible.name: root.frameTitle(modelData)
                Accessible.description: root.frameMeta(modelData)
                  + ". " + root.frameSummary(modelData)

                Column {
                  id: ambientColumn
                  anchors.left: parent.left
                  anchors.right: parent.right
                  anchors.verticalCenter: parent.verticalCenter
                  anchors.leftMargin: Style.space(8)
                  anchors.rightMargin: Style.space(8)
                  spacing: Style.space(1)

                  Text {
                    width: parent.width
                    text: root.frameMeta(modelData)
                    textFormat: Text.PlainText
                    color: root.alpha(root.foreground, 0.5)
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    elide: Text.ElideRight
                  }

                  Text {
                    width: parent.width
                    text: root.frameLine(modelData)
                    textFormat: Text.PlainText
                    color: root.alpha(root.foreground, 0.62)
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    elide: Text.ElideRight
                  }
                }
              }
            }
          }
        }
      }

        Text {
          id: shortcutFooter
          visible: root.presentsSnapshot
          width: parent.width
          height: visible ? Style.space(18) : 0
          text: Presentation.shortcutFooter(
            root.presentsSnapshot, root.navigableFrames.length > 0)
          textFormat: Text.PlainText
          color: root.alpha(root.foreground, 0.5)
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          horizontalAlignment: Text.AlignHCenter
          verticalAlignment: Text.AlignVCenter
          elide: Text.ElideRight
        }

      }
    }
  }
}
