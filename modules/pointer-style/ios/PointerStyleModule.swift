import ExpoModulesCore
import UIKit

/// Lets a view change the iPadOS pointer while it's hovered, e.g. resize arrows.
public class PointerStyleModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PointerStyle")

    View(PointerStyleView.self) {
      Prop("accessories") { (view: PointerStyleView, accessories: [String]) in
        view.accessories = accessories
      }
    }
  }
}

final class PointerStyleView: ExpoView, UIPointerInteractionDelegate {
  var accessories: [String] = [] {
    didSet { interaction?.invalidate() }
  }
  private var interaction: UIPointerInteraction?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    guard UIDevice.current.userInterfaceIdiom == .pad else { return }
    let interaction = UIPointerInteraction(delegate: self)
    addInteraction(interaction)
    self.interaction = interaction
  }

  func pointerInteraction(
    _ interaction: UIPointerInteraction,
    styleFor region: UIPointerRegion
  ) -> UIPointerStyle? {
    let style = UIPointerStyle.system()
    style.accessories = accessories.compactMap { name in
      switch name {
      case "left": return .arrow(.left)
      case "right": return .arrow(.right)
      case "up": return .arrow(.top)
      case "down": return .arrow(.bottom)
      default: return nil
      }
    }
    return style
  }
}
