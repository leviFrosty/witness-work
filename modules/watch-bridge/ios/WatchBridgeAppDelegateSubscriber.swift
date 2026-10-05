import ExpoModulesCore

/// Activates the watch connection at launch, before JS loads. A message from
/// the watch can launch the app in the background, and its delivery needs a
/// session delegate already in place.
public class WatchBridgeAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    WatchSessionCoordinator.shared.activate()
    return true
  }
}
