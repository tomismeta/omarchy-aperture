import QtQuick
import QtQuick.Controls
import Quickshell
import qs.Commons
import qs.Ui

// Passive attention preview. It never requests keyboard focus; explicit
// actions arm only after the accidental-click guard and deliberate movement.
PopupWindow {
  id: root

  required property Item anchorItem
  required property QtObject bar
  property bool open: false
  property var cards: []
  property int unshownCount: 0
  property string openShortcut: "Super + A"
  property color foreground: Color.foreground
  property color dim: Color.muted
  property string fontFamily: Style.font.family
  readonly property int clickGuardMs: 450
  property bool guardElapsed: false
  property bool pointerIntentObserved: false
  readonly property bool interactionArmed:
    open && guardElapsed && pointerIntentObserved
  readonly property bool reading: interactionArmed && deckHover.hovered
  signal activated(string identity)
  signal overviewRequested()

  readonly property var anchorWindow: anchorItem ? anchorItem.QsWindow.window : null
  readonly property var popupScreen: anchorWindow ? anchorWindow.screen : null
  readonly property real screenWidth: popupScreen ? popupScreen.width : 0
  readonly property real screenHeight: popupScreen ? popupScreen.height : 0
  readonly property real maximumHeight: Math.min(Style.space(560),
    screenHeight > 0 ? Math.max(0, screenHeight - margin * 2
      - (bar && (bar.position === "top" || bar.position === "bottom") && anchorItem
        ? anchorItem.height : 0)) : Style.space(560))
  readonly property int margin: Style.gapsOut
  readonly property real overviewHeight: overviewButton.implicitHeight + Style.space(12)

  // Pin the configured origin, not the requested anchor: the compositor may
  // already have slid this popup to fit. While reading, only its bottom edge may
  // grow; ResizeY clips that growth to available space instead of sliding actions.
  property bool geometryHeld: false
  property point heldOrigin: Qt.point(0, 0)
  property int heldWidth: 1

  function holdGeometry() {
    if (geometryHeld || !anchorWindow) return
    heldOrigin = anchorWindow.contentItem.mapFromItem(card, 0, 0)
    heldWidth = Math.max(1, width)
    geometryHeld = true
  }

  function syncReading() {
    if (reading) {
      holdGeometry()
    } else {
      geometryHeld = false
      // Leaving restores canonical layout and may reposition the popup.
      if (open && pointerIntentObserved) resetInteraction()
    }
  }
  // Guard and geometry changes must not feed back into reading's binding.
  onReadingChanged: Qt.callLater(syncReading)

  visible: open
  color: "transparent"
  implicitWidth: geometryHeld ? heldWidth : Math.round(Math.min(
    Style.space(400),
    screenWidth > 0 ? Math.max(0, screenWidth - margin * 2) : Style.space(400)))
  // Wayland popup positioners require a positive size, including before layout.
  implicitHeight: Math.max(1, Math.round(Math.min(
    maximumHeight, deckColumn.implicitHeight + overviewHeight)))
  mask: Region {
    id: peekMask
    width: root.open && root.guardElapsed ? Math.min(root.width, root.implicitWidth) : 0
    height: root.open && root.guardElapsed ? Math.min(root.height, root.implicitHeight) : 0
  }
  onInteractionArmedChanged: peekMask.changed()
  onGuardElapsedChanged: peekMask.changed()

  function resetInteraction() {
    guardElapsed = false
    pointerIntentObserved = false
    pointerGate.reset()
    if (open) clickGuard.restart()
    else clickGuard.stop()
  }

  onOpenChanged: {
    resetInteraction()
    if (open) deckFlick.contentY = 0
  }
  function syncCards() {
    var prefix = 0
    while (prefix < cardModel.count && prefix < cards.length
        && cardModel.get(prefix).identity === cards[prefix].identity) prefix++
    if (prefix < cardModel.count) {
      resetInteraction()
      cardModel.remove(prefix, cardModel.count - prefix)
    }
    for (var index = prefix; index < cards.length; index++)
      cardModel.append({ identity: cards[index].identity })
  }

  onCardsChanged: syncCards()
  Component.onCompleted: syncCards()

  ListModel { id: cardModel }

  anchor {
    id: popupAnchor
    window: root.anchorWindow
    adjustment: root.geometryHeld ? PopupAdjustment.ResizeY
      : PopupAdjustment.Slide | PopupAdjustment.Resize
    edges: Edges.Top | Edges.Left
    gravity: Edges.Bottom | Edges.Right
    rect.width: 1
    rect.height: 1

    onAnchoring: {
      if (!root.anchorItem || !root.bar || !root.anchorWindow) return
      if (root.geometryHeld) {
        popupAnchor.rect.x = Math.round(root.heldOrigin.x)
        popupAnchor.rect.y = Math.round(root.heldOrigin.y)
        return
      }
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


  Item {
    id: card
    anchors.fill: parent
    Accessible.role: Accessible.Grouping
    Accessible.name: "Aperture attention"

    Column {
      id: peekContent
      anchors.fill: parent

      // Reserve this route from first reveal so overflow cannot move held cards.
      Item {
        width: parent.width
        height: root.overviewHeight

        Button {
          id: overviewButton
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.bottom: parent.bottom
          text: root.unshownCount > 0
            ? root.unshownCount + " more · Open Aperture" : "Open Aperture"
          enabled: root.interactionArmed
          bordered: true
          focusable: false
          foreground: enabled ? root.foreground : root.dim
          fontFamily: root.fontFamily
          fontSize: Style.font.bodySmall
          verticalPadding: Style.space(3)
          Accessible.role: Accessible.Button
          Accessible.name: text
          Accessible.description: "Open the current attention overview."
          Accessible.onPressAction: {
            if (root.interactionArmed) root.overviewRequested()
          }
          onClicked: {
            if (root.interactionArmed) root.overviewRequested()
          }
        }
      }
      Flickable {
        id: deckFlick
        width: parent.width
        height: Math.max(0, parent.height - root.overviewHeight)
        contentWidth: width
        contentHeight: deckColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.VerticalFlick
        interactive: contentHeight > height
        ScrollBar.vertical: ScrollBar {
          id: deckScrollBar
          policy: ScrollBar.AsNeeded
        }

        Column {
          id: deckColumn
          // A fixed transparent gutter keeps text wrapping stable while reading.
          width: Math.max(0, deckFlick.width - deckScrollBar.implicitWidth - Style.space(4))
          spacing: Style.space(12)

          Repeater {
            // Appending to ListModel preserves existing delegates and hover state.
            model: cardModel

            BorderSurface {
              id: entry
              required property int index
              readonly property var modelData: root.cards[index] || ({
                identity: "", meta: "", title: "", summary: "",
                canFocusSession: false, availabilityMessage: ""
              })
              property bool expandedDuringReading: false
              readonly property bool expanded: root.interactionArmed && root.geometryHeld
                && (entryHover.hovered || expandedDuringReading)
              onExpandedChanged: {
                if (expanded) expandedDuringReading = true
              }
              Connections {
                target: root
                function onReadingChanged() {
                  if (!root.reading) entry.expandedDuringReading = false
                }
              }
              readonly property string accessibleContext: modelData.meta + ". " + modelData.title
                + (modelData.summary === "" ? "" : ". " + modelData.summary)
              readonly property string actionDescription: !modelData.canFocusSession
                ? (modelData.availabilityMessage || "Session navigation is unavailable.")
                : "Open the originating OMP session."
              width: deckColumn.width
              implicitHeight: Math.max(mark.height, notificationText.implicitHeight)
                + contentTopInset + contentBottomInset
              color: Color.popups.background
              borderSpec: Border.surfaceSpec(
                "popups", "border", Color.popups.border, Math.max(1, Style.normalBorderWidth))
              radius: Style.cornerRadius
              padding: Style.space(10)
              Accessible.role: Accessible.Grouping
              Accessible.name: accessibleContext
              Accessible.description: root.openShortcut === ""
                ? "Hover for session navigation. Open Aperture from the bar."
                : "Hover for session navigation. " + root.openShortcut + " opens Aperture."

              ApertureMark {
                id: mark
                x: entry.contentLeftInset
                y: entry.contentTopInset
                width: Style.space(32)
                height: width
                color: root.foreground
                alert: true
              }

              Column {
                id: notificationText
                x: entry.contentLeftInset + mark.width + Style.space(8)
                y: entry.contentTopInset
                width: Math.max(0, entry.width - x - entry.contentRightInset)
                spacing: Style.space(2)

                Text {
                  width: parent.width
                  text: entry.modelData.meta
                  textFormat: Text.PlainText
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                  font.bold: true
                  wrapMode: Text.Wrap
                }

                Text {
                  width: parent.width
                  text: entry.modelData.title
                  textFormat: Text.PlainText
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  wrapMode: Text.Wrap
                }

                Text {
                  visible: entry.modelData.summary !== ""
                  width: parent.width
                  text: entry.modelData.summary
                  textFormat: Text.PlainText
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  wrapMode: Text.Wrap
                }

                Item {
                  visible: entry.expanded
                  width: parent.width
                  height: Math.max(sessionButton.implicitHeight, shortcutHint.implicitHeight)
                    + Style.space(4)

                  Text {
                    id: shortcutHint
                    anchors.left: parent.left
                    anchors.right: sessionButton.left
                    anchors.rightMargin: Style.space(6)
                    anchors.verticalCenter: sessionButton.verticalCenter
                    text: root.openShortcut === ""
                      ? "Aperture in the bar"
                      : root.openShortcut + " · Aperture"
                    textFormat: Text.PlainText
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    wrapMode: Text.Wrap
                  }

                  Button {
                    id: sessionButton
                    anchors.right: parent.right
                    anchors.bottom: parent.bottom
                    text: entry.modelData.canFocusSession ? "Open Session" : "Unavailable"
                    enabled: root.interactionArmed && entry.modelData.canFocusSession
                    bordered: true
                    focusable: false
                    foreground: enabled ? root.foreground : root.dim
                    fontFamily: root.fontFamily
                    fontSize: Style.font.bodySmall
                    verticalPadding: Style.space(3)
                    Accessible.role: Accessible.Button
                    Accessible.name: "Open Session. " + entry.modelData.meta
                    Accessible.description: entry.accessibleContext + ". " + entry.actionDescription
                    Accessible.onPressAction: {
                      if (root.interactionArmed && entry.modelData.canFocusSession)
                        root.activated(entry.modelData.identity)
                    }
                    onClicked: {
                      if (root.interactionArmed && entry.modelData.canFocusSession)
                        root.activated(entry.modelData.identity)
                    }
                  }
                }
              }

              HoverHandler {
                id: entryHover
                enabled: root.open && root.guardElapsed
              }
            }
          }
        }
      }


    }

    HoverHandler {
      id: deckHover
      enabled: root.open && root.guardElapsed
      onPointChanged: {
        if (hovered && root.open && root.guardElapsed
            && pointerGate.moved(card, point.position))
          root.pointerIntentObserved = true
      }
    }
  }


  PointerMoveGate {
    id: pointerGate
    referenceItem: root.anchorWindow ? root.anchorWindow.contentItem : card
  }

  Timer {
    id: clickGuard
    interval: root.clickGuardMs
    running: root.open && !root.guardElapsed
    repeat: false
    onTriggered: root.guardElapsed = true
  }
}
