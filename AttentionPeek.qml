import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

// Passive NOW preview. It never requests keyboard focus; pointer input and
// the outside-click grab arm only after the accidental-click guard.
PopupWindow {
  id: root

  required property Item anchorItem
  required property QtObject bar
  property bool open: false
  property bool canFocusSession: false
  property string meta: ""
  property string title: ""
  property string summary: ""
  property color foreground: Color.foreground
  property color dim: Color.muted
  property string fontFamily: Style.font.family
  readonly property int clickGuardMs: 450
  property bool guardElapsed: false
  property bool pointerIntentObserved: false
  readonly property bool interactionArmed:
    open && canFocusSession && guardElapsed && pointerIntentObserved
  readonly property string actionHint: canFocusSession
    ? "Point here, then click to focus" : "Passive preview · focus unavailable"
  signal activated()

  readonly property var anchorWindow: anchorItem ? anchorItem.QsWindow.window : null
  readonly property var popupScreen: anchorWindow ? anchorWindow.screen : null
  readonly property real screenWidth: popupScreen ? popupScreen.width : 0
  readonly property int margin: Style.gapsOut

  visible: open
  color: "transparent"
  implicitWidth: Math.round(Math.min(
    Style.space(360),
    screenWidth > 0 ? Math.max(0, screenWidth - margin * 2) : Style.space(360)))
  implicitHeight: peekColumn.implicitHeight + Style.space(16)
  mask: Region {
    id: peekMask
    width: root.guardElapsed && root.canFocusSession ? root.implicitWidth : 0
    height: root.guardElapsed && root.canFocusSession ? root.implicitHeight : 0
  }
  onInteractionArmedChanged: peekMask.changed()
  onGuardElapsedChanged: peekMask.changed()
  onCanFocusSessionChanged: peekMask.changed()

  onOpenChanged: {
    guardElapsed = false
    pointerIntentObserved = false
  }

  anchor {
    id: popupAnchor
    window: root.anchorWindow
    adjustment: PopupAdjustment.Slide | PopupAdjustment.ResizeX
    edges: Edges.Top | Edges.Left
    gravity: Edges.Bottom | Edges.Right
    rect.width: 1
    rect.height: 1

    onAnchoring: {
      if (!root.anchorItem || !root.bar || !root.anchorWindow) return
      var target = root.anchorItem
      var popupWidth = root.implicitWidth
      var popupHeight = root.implicitHeight
      var localX = target.width / 2 - popupWidth / 2
      var localY = target.height + root.margin

      if (root.bar.position === "bottom") {
        localY = -popupHeight - root.margin
      } else if (root.bar.position === "left") {
        localX = target.width + root.margin
        localY = target.height / 2 - popupHeight / 2
      } else if (root.bar.position === "right") {
        localX = -popupWidth - root.margin
        localY = target.height / 2 - popupHeight / 2
      }

      var point = root.anchorWindow.contentItem.mapFromItem(target, localX, localY)
      if (root.bar.position === "top" || root.bar.position === "bottom")
        point.x = Math.max(root.margin, Math.min(
          point.x, root.anchorWindow.width - popupWidth - root.margin))
      else
        point.y = Math.max(root.margin, Math.min(
          point.y, root.anchorWindow.height - popupHeight - root.margin))
      popupAnchor.rect.x = Math.round(point.x)
      popupAnchor.rect.y = Math.round(point.y)
    }
  }


  BorderSurface {
    anchors.fill: parent
    color: Color.popups.background
    borderSpec: Border.surfaceSpec(
      "popups", "border", Color.popups.border, Math.max(1, Style.normalBorderWidth))
    radius: Style.cornerRadius
    Accessible.role: root.interactionArmed
      ? Accessible.Button : Accessible.StaticText
    Accessible.name: (root.interactionArmed
      ? "Focus OMP session. " : "Aperture NOW. ")
      + root.meta + ". " + root.title
      + (root.summary === "" ? "" : ". " + root.summary)
    Accessible.description: root.interactionArmed
      ? "Click to focus the OMP session requesting attention."
      : (root.canFocusSession
        ? "Move the pointer across this preview to enable click-to-focus."
        : "Passive alert. Session focus is unavailable.")
    Accessible.onPressAction: if (root.interactionArmed) root.activated()

    Column {
      id: peekColumn
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: Style.space(8)
      anchors.rightMargin: Style.space(8)
      spacing: Style.space(2)

      Item {
        width: parent.width
        implicitHeight: Math.max(peekLane.implicitHeight, peekMeta.implicitHeight)

        Text {
          id: peekLane
          anchors.left: parent.left
          anchors.verticalCenter: parent.verticalCenter
          text: "NOW"
          textFormat: Text.PlainText
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          font.bold: true
        }

        Text {
          id: peekMeta
          anchors.left: peekLane.right
          anchors.right: parent.right
          anchors.leftMargin: Style.space(8)
          anchors.verticalCenter: parent.verticalCenter
          text: root.meta
          textFormat: Text.PlainText
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          horizontalAlignment: Text.AlignRight
          elide: Text.ElideRight
        }
      }

      Text {
        width: parent.width
        text: root.title
        textFormat: Text.PlainText
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        font.bold: true
        maximumLineCount: 2
        wrapMode: Text.WordWrap
        elide: Text.ElideRight
      }

      Text {
        visible: root.summary !== ""
        width: parent.width
        text: root.summary
        textFormat: Text.PlainText
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        maximumLineCount: 2
        wrapMode: Text.WordWrap
        elide: Text.ElideRight
      }

      Text {
        width: parent.width
        text: root.actionHint
        textFormat: Text.PlainText
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
        wrapMode: Text.WordWrap
      }
    }

    MouseArea {
      anchors.fill: parent
      enabled: root.open && root.guardElapsed && root.canFocusSession
      hoverEnabled: true
      acceptedButtons: root.interactionArmed ? Qt.LeftButton : Qt.NoButton
      cursorShape: root.interactionArmed ? Qt.PointingHandCursor : Qt.ArrowCursor
      onPositionChanged: root.pointerIntentObserved = true
      onClicked: if (root.interactionArmed) root.activated()
    }
  }

  Timer {
    id: clickGuard
    interval: root.clickGuardMs
    running: root.open && !root.guardElapsed
    repeat: false
    onTriggered: root.guardElapsed = true
  }
}
