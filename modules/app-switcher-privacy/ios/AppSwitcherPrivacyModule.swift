import ExpoModulesCore
import UIKit

/// Keeps the app's screen out of the app switcher while App Lock is on. iOS
/// snapshots the app as it leaves the foreground, before React Native can draw
/// its lock screen, so the cover goes up natively as the app resigns active and
/// comes down when it's active again.
public final class AppSwitcherPrivacyModule: Module {
  private var hidden = false
  private var observers: [NSObjectProtocol] = []
  private var covers: [UIWindow] = []

  public func definition() -> ModuleDefinition {
    Name("AppSwitcherPrivacy")

    Constant("appSwitcherPrivacyVersion") {
      1
    }

    AsyncFunction("setHidden") { (hidden: Bool) in
      self.setHidden(hidden)
    }.runOnQueue(.main)

    OnDestroy {
      DispatchQueue.main.async {
        self.setHidden(false)
      }
    }
  }

  private func setHidden(_ hidden: Bool) {
    guard hidden != self.hidden else { return }
    self.hidden = hidden
    let center = NotificationCenter.default
    if hidden {
      for name in [
        UIApplication.willResignActiveNotification,
        UIApplication.didEnterBackgroundNotification,
      ] {
        observers.append(
          center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
            self?.cover()
          })
      }
      observers.append(
        center.addObserver(
          forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
          self?.uncover()
        })
    } else {
      observers.forEach(center.removeObserver)
      observers = []
      uncover()
    }
  }

  /// One opaque window per scene, above the app's own windows and its
  /// full-window overlays.
  private func cover() {
    guard covers.isEmpty else { return }
    for scene in UIApplication.shared.connectedScenes {
      guard let scene = scene as? UIWindowScene else { continue }
      let window = UIWindow(windowScene: scene)
      window.windowLevel = .alert + 1
      let controller = UIViewController()
      controller.view.backgroundColor = .systemBackground
      window.rootViewController = controller
      window.isHidden = false
      covers.append(window)
    }
  }

  private func uncover() {
    covers.forEach { $0.isHidden = true }
    covers = []
  }
}
