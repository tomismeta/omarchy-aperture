import QtQuick
import QtQuick.Shapes
import qs.Commons

Item {
  id: root

  property color color: Color.foreground

  implicitWidth: Style.font.display
  implicitHeight: Style.font.display

  Shape {
    id: mark
    width: 24
    height: 24
    anchors.centerIn: parent
    scale: Math.min(root.width / width, root.height / height)
    antialiasing: true

    // The broken aperture stays recognizable as the product frame while the
    // centered head and shoulders make the human—not another bot—the subject.
    ShapePath {
      strokeColor: root.color
      strokeWidth: 1.4
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap
      joinStyle: ShapePath.RoundJoin

      PathSvg {
        path: "M8.96 4.06 A8.5 8.5 0 0 1 15.04 4.06 M17.34 5.39 A8.5 8.5 0 0 1 20.40 10.67 M20.40 13.33 A8.5 8.5 0 0 1 17.34 18.61 M15.04 19.94 A8.5 8.5 0 0 1 8.96 19.94 M6.65 18.61 A8.5 8.5 0 0 1 3.60 13.33 M3.60 10.67 A8.5 8.5 0 0 1 6.65 5.39"
      }
    }

    ShapePath {
      strokeColor: "transparent"
      strokeWidth: 0
      fillColor: root.color

      PathSvg {
        path: "M14 9 A2 2 0 1 1 10 9 A2 2 0 1 1 14 9 Z"
      }
    }

    ShapePath {
      strokeColor: root.color
      strokeWidth: 1.4
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap
      joinStyle: ShapePath.RoundJoin

      PathSvg {
        path: "M7.5 17 C7.9 14.3 9.5 13 12 13 C14.5 13 16.1 14.3 16.5 17"
      }
    }
  }
}
