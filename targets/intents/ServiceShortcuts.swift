import AppIntents

/// Siri phrases, the same on the iPhone and the watch. Canonical here and
/// copied into `targets/watch/Shared`. Each phrase must match its
/// `siriShortcut*` value in `src/locales/en-US.json` with `${applicationName}`
/// written as `\(.applicationName)`; `scripts/sync-widget-shared.mjs` checks
/// this and builds `AppShortcuts.xcstrings` from the translations.
struct WitnessWorkShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: AddServiceTimeIntent(),
      phrases: [
        "Add time in \(.applicationName)",
        "Log time in \(.applicationName)",
      ],
      shortTitle: "addTime",
      systemImageName: "plus.circle")
    AppShortcut(
      intent: StartServiceTimerIntent(),
      phrases: ["Start my timer in \(.applicationName)"],
      shortTitle: "timerStartAction",
      systemImageName: "play.circle")
    AppShortcut(
      intent: PauseServiceTimerIntent(),
      phrases: ["Pause my timer in \(.applicationName)"],
      shortTitle: "timerPauseAction",
      systemImageName: "pause.circle")
    AppShortcut(
      intent: StopServiceTimerIntent(),
      phrases: ["Stop my timer in \(.applicationName)"],
      shortTitle: "siriStopTimerShort",
      systemImageName: "stop.circle")
    AppShortcut(
      intent: LogTripIntent(),
      phrases: ["Log a trip in \(.applicationName)"],
      shortTitle: "mileage.logTrip",
      systemImageName: "car")
    AppShortcut(
      intent: LogRoundTripIntent(),
      phrases: ["Log a round trip in \(.applicationName)"],
      shortTitle: "siriLogRoundTripShort",
      systemImageName: "arrow.triangle.2.circlepath")
  }
}
