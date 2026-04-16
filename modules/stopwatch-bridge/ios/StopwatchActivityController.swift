import ActivityKit
import Foundation

/// Thin wrapper around `ActivityKit` for the stopwatch activity. Callable from
/// both the main app (when JS dispatches commands) and the widget extension
/// (when a `LiveActivityIntent` fires from the lock screen).
@available(iOS 16.2, *)
public enum StopwatchActivityController {

  /// Starts a new activity if none exists, otherwise updates the existing one.
  @discardableResult
  public static func startOrUpdate(
    _ state: StopwatchAttributes.ContentState
  ) async -> String? {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }

    if let existing = currentActivity() {
      await existing.update(
        ActivityContent(state: state, staleDate: nil)
      )
      return existing.id
    }

    do {
      let activity = try Activity.request(
        attributes: StopwatchAttributes(),
        content: ActivityContent(state: state, staleDate: nil),
        pushType: nil
      )
      return activity.id
    } catch {
      return nil
    }
  }

  public static func update(_ state: StopwatchAttributes.ContentState) async {
    // Iterate all activities — the `activities` array is eventually
    // consistent and may briefly hold more than one entry after a rapid
    // request/update sequence. Updating every entry keeps the UI in sync
    // even if iOS transiently held a stale handle.
    let content = ActivityContent(state: state, staleDate: nil)
    for activity in Activity<StopwatchAttributes>.activities {
      await activity.update(content)
    }
  }

  public static func end(
    finalState: StopwatchAttributes.ContentState,
    dismissalPolicy: ActivityUIDismissalPolicy = .immediate
  ) async {
    for activity in Activity<StopwatchAttributes>.activities {
      await activity.end(
        ActivityContent(state: finalState, staleDate: nil),
        dismissalPolicy: dismissalPolicy
      )
    }
  }

  public static func currentActivity() -> Activity<StopwatchAttributes>? {
    Activity<StopwatchAttributes>.activities.first
  }
}
