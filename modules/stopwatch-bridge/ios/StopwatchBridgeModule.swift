import ActivityKit
import ExpoModulesCore
import Foundation
import UIKit

/// Bridges the shared `StopwatchStore` + Live Activity controller to JS.
///
/// State is persisted in App Group UserDefaults by `StopwatchStore`, so the
/// widget extension's App Intents (pause/resume/stop on the lock screen) and
/// this module share the same source of truth. After a command runs, the
/// resolved state is returned to JS and broadcast on the `onStateChange` event.
public class StopwatchBridgeModule: Module {
  private var didEnterForegroundObserver: NSObjectProtocol?
  private var lastSeenCounter: Int = 0

  public func definition() -> ModuleDefinition {
    Name("StopwatchBridge")

    Events("onStateChange")

    OnCreate {
      if #available(iOS 16.1, *) {
        self.lastSeenCounter = StopwatchStore.commandCounter
      }
      self.didEnterForegroundObserver = NotificationCenter.default.addObserver(
        forName: UIApplication.willEnterForegroundNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.reemitIfChanged()
      }
    }

    OnDestroy {
      if let observer = self.didEnterForegroundObserver {
        NotificationCenter.default.removeObserver(observer)
      }
    }

    Function("getState") { () -> [String: Any?] in
      guard #available(iOS 16.1, *) else { return Self.encodeZero() }
      return Self.encode(StopwatchStore.load())
    }

    Function("areLiveActivitiesEnabled") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    AsyncFunction("start") { () -> [String: Any?] in
      guard #available(iOS 16.2, *) else { return Self.encodeZero() }
      let next = StopwatchStore.start()
      await StopwatchActivityController.startOrUpdate(next)
      self.emitChange(next)
      return Self.encode(next)
    }

    AsyncFunction("pause") { () -> [String: Any?] in
      guard #available(iOS 16.2, *) else { return Self.encodeZero() }
      let next = StopwatchStore.pause()
      await StopwatchActivityController.update(next)
      self.emitChange(next)
      return Self.encode(next)
    }

    AsyncFunction("resume") { () -> [String: Any?] in
      guard #available(iOS 16.2, *) else { return Self.encodeZero() }
      let next = StopwatchStore.start()
      await StopwatchActivityController.startOrUpdate(next)
      self.emitChange(next)
      return Self.encode(next)
    }

    AsyncFunction("stop") { () -> [String: Any?] in
      guard #available(iOS 16.2, *) else { return Self.encodeZero() }
      let next = StopwatchStore.stop()
      await StopwatchActivityController.end(finalState: next)
      self.emitChange(next)
      return Self.encode(next)
    }

    AsyncFunction("reset") { () -> [String: Any?] in
      guard #available(iOS 16.2, *) else { return Self.encodeZero() }
      let next = StopwatchStore.reset()
      await StopwatchActivityController.end(finalState: next)
      self.emitChange(next)
      return Self.encode(next)
    }
  }

  // MARK: - Helpers

  @available(iOS 16.1, *)
  private func emitChange(_ state: StopwatchAttributes.ContentState) {
    self.lastSeenCounter = StopwatchStore.commandCounter
    self.sendEvent("onStateChange", Self.encode(state))
  }

  /// Called when the app foregrounds. If a lock-screen intent mutated state
  /// while JS was suspended, the command counter advances and we re-emit.
  private func reemitIfChanged() {
    guard #available(iOS 16.1, *) else { return }
    let current = StopwatchStore.commandCounter
    if current != self.lastSeenCounter {
      self.lastSeenCounter = current
      self.sendEvent("onStateChange", Self.encode(StopwatchStore.load()))
    }
  }

  @available(iOS 16.1, *)
  private static func encode(
    _ state: StopwatchAttributes.ContentState
  ) -> [String: Any?] {
    return [
      "startedAt": state.startedAt,
      "accumulatedMs": state.accumulatedMs,
      "isRunning": state.isRunning,
      "updatedAt": state.updatedAt,
    ]
  }

  private static func encodeZero() -> [String: Any?] {
    return [
      "startedAt": nil,
      "accumulatedMs": 0.0,
      "isRunning": false,
      "updatedAt": 0.0,
    ]
  }
}
