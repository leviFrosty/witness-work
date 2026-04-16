import AppIntents
import Foundation

// `LiveActivityIntent` (iOS 17+) runs in-process when a user taps a button on
// a Live Activity without launching the host app. We mutate the shared state,
// persist it via App Group UserDefaults, and push the new ActivityKit content.
//
// These intent types are compiled into the widget extension so SwiftUI's
// `Button(intent:)` can reference them; they also compile into the host app
// via the expo-module podspec so the host app can invoke them directly if
// useful. Both contexts share the same `StopwatchStore` via App Group.

@available(iOS 17.0, *)
public struct StopwatchPauseIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Pause Stopwatch"

  public init() {}

  public func perform() async throws -> some IntentResult {
    let next = StopwatchStore.pause()
    if #available(iOS 16.2, *) {
      await StopwatchActivityController.update(next)
    }
    return .result()
  }
}

@available(iOS 17.0, *)
public struct StopwatchResumeIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Resume Stopwatch"

  public init() {}

  public func perform() async throws -> some IntentResult {
    let next = StopwatchStore.start()
    if #available(iOS 16.2, *) {
      await StopwatchActivityController.update(next)
    }
    return .result()
  }
}

@available(iOS 17.0, *)
public struct StopwatchStopIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Stop Stopwatch"

  public init() {}

  public func perform() async throws -> some IntentResult {
    let next = StopwatchStore.stop()
    if #available(iOS 16.2, *) {
      await StopwatchActivityController.end(finalState: next)
    }
    return .result()
  }
}
