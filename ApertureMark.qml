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

    // A short aperture arc over one solid human silhouette. Two bold shapes
    // remain legible at bar size; pressure is carried by their shared color.
    ShapePath {
      strokeColor: root.color
      strokeWidth: 2
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap
      joinStyle: ShapePath.RoundJoin

      PathSvg {
        path: "M3.44 9.22 A9 9 0 0 1 20.56 9.22"
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
