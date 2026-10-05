import AppIntents
import Foundation

// Run in the watch app's process, often in the background with no UI, so
// each one waits for the connection to activate first. Titles and dialogs
// are keys in the bundled catalog generated from `src/locales`.

struct AddServiceTimeIntent: AppIntent {
  static let title: LocalizedStringResource = "watchAddServiceTime"

  @Parameter(title: "watchDuration", defaultUnit: .minutes, supportsNegativeNumbers: false)
  var duration: Measurement<UnitDuration>

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    // An entry is at most 23h 59m, matching the iPhone's validation.
    let total = Int(duration.converted(to: .minutes).value.rounded())
    guard (1..<(24 * 60)).contains(total) else { throw WatchActionError.invalidDuration }
    await PhoneSession.shared.waitUntilActivated()
    let model = WatchModel.shared
    guard let snapshot = model.snapshot else { throw WatchActionError.notSetUp }
    guard snapshot.showsTimeEntry else { throw WatchActionError.hoursLoggingOff }
    await model.addEntry(
      hours: total / 60, minutes: total % 60, categoryId: nil, origin: .shortcut)
    return .result(dialog: IntentDialog("timeAdded"))
  }
}

struct StartServiceTimerIntent: AppIntent {
  static let title: LocalizedStringResource = "watchStartServiceTimer"

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    try await runTimer(.start)
    return .result(dialog: IntentDialog("watchTimerStarted"))
  }
}

struct PauseServiceTimerIntent: AppIntent {
  static let title: LocalizedStringResource = "watchPauseServiceTimer"

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    try await runTimer(.pause)
    return .result(dialog: IntentDialog("watchTimerPaused"))
  }
}

@MainActor
private func runTimer(_ action: WatchTimerAction) async throws {
  await PhoneSession.shared.waitUntilActivated()
  let model = WatchModel.shared
  guard let snapshot = model.snapshot else { throw WatchActionError.notSetUp }
  guard snapshot.showsTimeEntry else { throw WatchActionError.hoursLoggingOff }
  try await model.setTimer(action, origin: .shortcut)
}
