import AppIntents

/// Siri phrases. Each phrase must match its `watchShortcut*` value in
/// `src/locales/en-US.json` with `${applicationName}` written as
/// `\(.applicationName)`; `scripts/sync-widget-shared.mjs` checks this and
/// builds `AppShortcuts.xcstrings` from the translations.
struct WitnessWorkShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: AddServiceTimeIntent(),
      phrases: ["Add time in \(.applicationName)"],
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
  }
}
