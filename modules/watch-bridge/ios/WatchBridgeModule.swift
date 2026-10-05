import ExpoModulesCore
import WatchConnectivity

/// JS side of the watch connection. See `WatchSessionCoordinator` and
/// `src/app/watch/watchSync.ts`.
public class WatchBridgeModule: Module {
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("WatchBridge")

    Events("onInboxChange", "onStatusChange")

    OnCreate { [weak self] in
      WatchSessionCoordinator.shared.activate()
      let center = NotificationCenter.default
      self?.observers = [
        center.addObserver(
          forName: WatchSessionCoordinator.inboxDidChange, object: nil, queue: .main
        ) { _ in
          self?.sendEvent("onInboxChange", [:])
        },
        center.addObserver(
          forName: WatchSessionCoordinator.statusDidChange, object: nil, queue: .main
        ) { _ in
          self?.sendEvent("onStatusChange", [:])
        },
      ]
    }

    OnDestroy {
      self.observers.forEach(NotificationCenter.default.removeObserver)
      self.observers = []
    }

    Function("getStatus") { () -> [String: Any?] in
      guard WCSession.isSupported() else {
        return ["isSupported": false, "isPaired": false, "isWatchAppInstalled": false,
                "isComplicationEnabled": false, "activeComplications": nil]
      }
      let session = WCSession.default
      let activated = session.activationState == .activated
      return [
        "isSupported": true,
        "isPaired": activated && session.isPaired,
        "isWatchAppInstalled": activated && session.isWatchAppInstalled,
        "isComplicationEnabled": activated && session.isComplicationEnabled,
        "activeComplications": WatchSessionCoordinator.shared.activeComplications(),
      ]
    }

    Function("setSnapshot") { (json: String) throws in
      try WatchSessionCoordinator.shared.setSnapshot(json)
    }

    Function("getPendingEntries") { () -> [[String: Any?]] in
      WatchSessionCoordinator.shared.pendingEntries().map { entry in
        [
          "id": entry.id,
          "date": entry.date,
          "hours": entry.hours,
          "minutes": entry.minutes,
          "categoryId": entry.categoryId,
          "origin": entry.origin.rawValue,
        ]
      }
    }

    Function("resolveEntries") { (ids: [String]) in
      WatchSessionCoordinator.shared.resolveEntries(ids)
    }

    Function("takeEvents") { () -> [[String: Any]] in
      WatchSessionCoordinator.shared.takeEvents().map { event in
        ["name": event.name, "properties": event.properties]
      }
    }
  }
}
