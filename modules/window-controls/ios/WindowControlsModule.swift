import ExpoModulesCore
import UIKit

/// Tells a view how far iPadOS window controls (close, minimize, tile) reach
/// into it. A windowed app keeps them over its top-leading corner, where a
/// back button or account button would sit underneath and stop taking taps.
public class WindowControlsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WindowControls")

    View(WindowControlsInsetView.self) {
      Events("onInsetsChange")
    }
  }
}

final class WindowControlsInsetView: ExpoView {
  let onInsetsChange = EventDispatcher()
  private var reported: UIEdgeInsets?

  override func didMoveToWindow() {
    super.didMoveToWindow()
    report()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    report()
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    report()
  }

  /// UIKit's corner-adapted safe area, less the plain safe area, is the room
  /// the controls take from this view's edges. It's zero away from the corner.
  private func report() {
    var insets = UIEdgeInsets.zero
    if #available(iOS 26.0, *), window != nil {
      let adapted = edgeInsets(for: .safeArea(cornerAdaptation: .horizontal))
      insets.left = max(0, adapted.left - safeAreaInsets.left)
      insets.right = max(0, adapted.right - safeAreaInsets.right)
    }
    guard insets != reported else { return }
    reported = insets
    onInsetsChange(["left": insets.left, "right": insets.right])
  }
}
