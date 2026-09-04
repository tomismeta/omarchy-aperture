import QtQuick
import QtQuick.Shapes
import qs.Commons

Item {
  id: root

  property color color: Color.foreground
  property int pressureLevel: 0
  property bool alert: false
  readonly property int level: alert
    ? 4 : Math.max(0, Math.min(4, Math.round(pressureLevel)))

  implicitWidth: Style.font.display
  implicitHeight: Style.font.display

  Shape {
    width: 24
    height: 24
    anchors.centerIn: parent
    scale: Math.min(root.width / width, root.height / height)
    antialiasing: true
    // Keep the 24px arcs analytic; geometry tessellation shows facets at bar scale.
    preferredRendererType: Shape.CurveRenderer

    // Pressure changes stroke weight and adds aperture rails, so the state
    // remains distinct in monochrome and high-contrast themes.
    ShapePath {
      strokeColor: root.color
      strokeWidth: 1.5 + root.level * 0.35
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap
      joinStyle: ShapePath.RoundJoin

      PathSvg {
        path: "M3.44 9.22 A9 9 0 0 1 20.56 9.22"
      }
    }

    ShapePath {
      strokeColor: root.level >= 2 ? root.color : "transparent"
      strokeWidth: root.level >= 3 ? 2 : 1.5
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap

      PathSvg {
        path: "M5.25 6.65 A8.25 8.25 0 0 1 18.75 6.65"
      }
    }

    ShapePath {
      strokeColor: root.level >= 3 ? root.color : "transparent"
      strokeWidth: root.level >= 4 ? 2.25 : 1.5
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap

      PathSvg {
        path: "M3.25 11.5 L3.25 15 M20.75 11.5 L20.75 15"
      }
    }

    ShapePath {
      strokeColor: root.level >= 4 ? root.color : "transparent"
      strokeWidth: 2
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap

      PathSvg {
        path: "M6.25 20.5 L17.75 20.5"
      }
    }

    ShapePath {
      strokeColor: "transparent"
      strokeWidth: 0
      fillColor: root.color

      PathSvg {
        path: "M14.35 9.5 A2.35 2.35 0 1 1 9.65 9.5 A2.35 2.35 0 1 1 14.35 9.5 Z M6.2 19 C6.55 14.9 8.6 12.8 12 12.8 C15.4 12.8 17.45 14.9 17.8 19 Z"
      }
    }
  }
}
