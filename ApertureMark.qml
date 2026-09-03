import QtQuick
import QtQuick.Shapes
import qs.Commons

Item {
  id: root

  property color color: Color.foreground

  implicitWidth: Style.font.display
  implicitHeight: Style.font.display

  Shape {
    width: 24
    height: 24
    anchors.centerIn: parent
    scale: Math.min(root.width / width, root.height / height)
    antialiasing: true

    // One open aperture around a human operator. The lower-right break keeps
    // the aperture legible beside notification/profile glyphs at bar size.
    ShapePath {
      strokeColor: root.color
      strokeWidth: 1.75
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap
      joinStyle: ShapePath.RoundJoin

      PathSvg {
        path: "M18.6 17.5 A8.6 8.6 0 1 1 19.45 7.7"
      }
    }

    ShapePath {
      strokeColor: "transparent"
      strokeWidth: 0
      fillColor: root.color

      PathSvg {
        path: "M14.05 8.8 A2.05 2.05 0 1 1 9.95 8.8 A2.05 2.05 0 1 1 14.05 8.8 Z"
      }
    }

    ShapePath {
      strokeColor: root.color
      strokeWidth: 1.75
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap
      joinStyle: ShapePath.RoundJoin

      PathSvg {
        path: "M7.65 17 C8.1 14.45 9.7 13.15 12 13.15 C14.3 13.15 15.9 14.45 16.35 17"
      }
    }
  }
}
