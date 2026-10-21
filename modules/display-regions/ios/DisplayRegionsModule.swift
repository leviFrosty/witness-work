import ExpoModulesCore
import UIKit

/// Reports what iPhone Duo reserves in a view: the fold (a division region),
/// the edge the system puts its vertical bar on, and the horizontal size class.
public class DisplayRegionsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DisplayRegions")

    View(DisplayRegionsView.self) {
      Events("onRegionsChange")
    }
  }
}

/// Frames are in this view's own coordinates, so a layout can place its columns
/// on either side of the fold without converting anything.
final class DisplayRegionsView: ExpoView {
  let onRegionsChange = EventDispatcher()
  private var lastReport: NSDictionary?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    if #available(iOS 17.0, *) {
      var traits: [UITrait] = [
        UITraitHorizontalSizeClass.self,
        UITraitVerticalSizeClass.self,
        UITraitLayoutDirection.self,
      ]
      #if canImport(UIKit, _version: 9127.0.85) // iOS 27.1 SDK
      if #available(iOS 27.1, *) {
        traits += UITraitCollection.systemTraitsAffectingVerticalBarEdge
      }
      #endif
      registerForTraitChanges(traits) { (view: DisplayRegionsView, _) in
        view.report()
      }
    }
  }

  // UIKit re-runs `updateConstraints` when the regions read there change.
  override class var requiresConstraintBasedLayout: Bool { true }

  override func updateConstraints() {
    report()
    super.updateConstraints()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    setNeedsUpdateConstraints()
    report()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    setNeedsUpdateConstraints()
    report()
  }

  private func report() {
    guard window != nil else { return }
    let payload: NSDictionary = [
      "width": bounds.width,
      "height": bounds.height,
      "horizontalSizeClass": sizeClassName(traitCollection.horizontalSizeClass),
      "verticalBarEdge": verticalBarEdge() ?? NSNull(),
      "divisions": divisions(),
    ]
    guard payload != lastReport else { return }
    lastReport = payload
    onRegionsChange(payload as? [String: Any] ?? [:])
  }

  private func sizeClassName(_ sizeClass: UIUserInterfaceSizeClass) -> String {
    switch sizeClass {
    case .compact: return "compact"
    case .regular: return "regular"
    default: return "unspecified"
    }
  }

  /// The physical side, since the bar stays on the same side of the hardware in
  /// right-to-left languages.
  private func verticalBarEdge() -> String? {
    #if canImport(UIKit, _version: 9127.0.85) // iOS 27.1 SDK
    if #available(iOS 27.1, *) {
      let rtl = traitCollection.layoutDirection == .rightToLeft
      switch traitCollection.verticalBarEdge {
      case .leading: return rtl ? "right" : "left"
      case .trailing: return rtl ? "left" : "right"
      default: return nil
      }
    }
    #endif
    return nil
  }

  private func divisions() -> [[String: Any]] {
    #if canImport(UIKit, _version: 9127.0.85) // iOS 27.1 SDK
    if #available(iOS 27.1, *) {
      // Inactive folds keep their frame, so a layout can leave room early.
      return reservedRegions(kind: .division, options: .includeInactive).map { region in
        rect(region.frame).merging(["active": region.isActive]) { $1 }
      }
    }
    #endif
    return []
  }

  private func rect(_ frame: CGRect) -> [String: Any] {
    return [
      "x": frame.origin.x,
      "y": frame.origin.y,
      "width": frame.width,
      "height": frame.height,
    ]
  }
}
