import SwiftUI
import WatchKit

final class WatchAppDelegate: NSObject, WKApplicationDelegate {
  func applicationDidFinishLaunching() {
    PhoneSession.shared.activate()
  }

  func handle(_ backgroundTasks: Set<WKRefreshBackgroundTask>) {
    for task in backgroundTasks {
      if let connectivityTask = task as? WKWatchConnectivityRefreshBackgroundTask {
        PhoneSession.shared.handle(connectivityTask)
      } else {
        task.setTaskCompletedWithSnapshot(false)
      }
    }
  }
}

@main
struct WitnessWorkWatchApp: App {
  @WKApplicationDelegateAdaptor private var delegate: WatchAppDelegate
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(WatchModel.shared)
    }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active {
        Task { await WatchModel.shared.refresh() }
      }
    }
  }
}

struct RootView: View {
  @Environment(WatchModel.self) private var model
  /// An Up Next item opened from its complication.
  @State private var openedItemId: String?

  var body: some View {
    @Bindable var model = model
    NavigationStack {
      if let snapshot = model.snapshot {
        HomeView(snapshot: snapshot)
          .navigationDestination(item: $openedItemId) { id in
            UpNextView(itemId: id)
          }
      } else {
        ScrollView {
          Text(L10n.t("watchSetUp", nil))
            .multilineTextAlignment(.center)
            .padding()
        }
      }
    }
    .onOpenURL { url in
      openedItemId = UpNext.itemId(from: url)
    }
    .alert(
      L10n.t(model.alertKey ?? "", model.snapshot),
      isPresented: Binding(
        get: { model.alertKey != nil },
        set: { if !$0 { model.alertKey = nil } })
    ) {
      Button(L10n.t("ok", model.snapshot), role: .cancel) {}
    }
  }
}
