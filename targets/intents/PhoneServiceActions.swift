import Foundation
import UIKit

/// `ServiceActions` on the iPhone and iPad. Runs in this extension's process:
/// the timer changes here, through the App Group, and entries and trips wait
/// in `IntentInbox` until the app saves them, the next time it runs.
enum ServiceActions {
  static func snapshot() async -> WatchSnapshot? {
    IntentInbox.loadSnapshot()
  }

  static func storedSnapshot() -> WatchSnapshot? {
    IntentInbox.loadSnapshot()
  }

  static func addEntry(minutes: Int, categoryId: String?) async throws {
    let entry = WatchEntryDraft(
      id: UUID().uuidString, date: today(), hours: minutes / 60, minutes: minutes % 60,
      categoryId: categoryId, origin: .phoneShortcut)
    guard IntentInbox.add({ $0.entries.append(entry) }) else {
      throw ServiceActionError.failed
    }
  }

  static func setTimer(_ action: WatchTimerAction) async throws {
    let next = action == .start ? StopwatchStore.start() : StopwatchStore.pause()
    // Starting a Live Activity needs the app; it catches up when it's next
    // active (`StopwatchExternalChanges`).
    await StopwatchActivityController.update(next)
  }

  static func stopTimer(categoryId: String?) async throws {
    let paused = StopwatchStore.pause()
    let minutes = WatchEntryDraft.timerMinutes(elapsedMs: paused.accumulatedMs)
    guard minutes < WatchEntryDraft.minutesRange.upperBound else {
      await StopwatchActivityController.update(paused)
      throw ServiceActionError.timerTooLong
    }
    guard minutes >= WatchEntryDraft.minutesRange.lowerBound else {
      await StopwatchActivityController.update(paused)
      throw ServiceActionError.timerEmpty
    }
    // Stored before the reset, so the time is never lost.
    try await addEntry(minutes: minutes, categoryId: categoryId)
    let reset = StopwatchStore.reset()
    await StopwatchActivityController.end(finalState: reset)
  }

  static func addTrip(vehicleId: String, distanceMiles: Double, roundTrip: Bool) async throws {
    let trip = WatchTripDraft(
      id: UUID().uuidString, date: today(), vehicleId: vehicleId,
      distanceMiles: distanceMiles, roundTrip: roundTrip, origin: .phoneShortcut)
    guard IntentInbox.add({ $0.trips.append(trip) }) else {
      throw ServiceActionError.failed
    }
  }

  /// The app captures these when it next runs.
  @MainActor
  static func record(_ action: ServiceAction, error: ServiceActionError?) {
    var properties = [
      "action": action.rawValue,
      "device": UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "iphone",
    ]
    if let error { properties["reason"] = error.reason }
    let event = IntentInbox.Event(
      name: error == nil ? "siri_action_completed" : "siri_action_failed",
      properties: properties)
    IntentInbox.add { $0.events.append(event) }
  }

  /// Today as Gregorian `YYYY-MM-DD`, whatever calendar the user has chosen.
  private static func today(_ date: Date = .now) -> String {
    let parts = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
  }
}
