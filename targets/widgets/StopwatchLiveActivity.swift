import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// Live Activity for the stopwatch. Appears on the lock screen and in the
/// Dynamic Island. Buttons (pause/resume/stop) are driven by
/// `LiveActivityIntent`s — taps execute in-process without unlocking the
/// device or foregrounding the app.
///
/// The timer text uses `Text(timerInterval:)` so it self-updates each second
/// without requiring ActivityKit pushes.
///
/// The label, direction and digits follow the app's Language from the widget
/// snapshot, as the widgets do; the Activity's attributes carry none of it.
@available(iOS 16.2, *)
struct StopwatchLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: StopwatchAttributes.self) { context in
      // Lock screen + banner presentation.
      let snapshot = StopwatchSnapshot.load()
      StopwatchLockScreenView(state: context.state, label: snapshot.timerLabel)
        .appLanguage(snapshot.language)
        .activityBackgroundTint(Color.black.opacity(0.6))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      let snapshot = StopwatchSnapshot.load()
      let language = snapshot.language
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label {
            Text(snapshot.timerLabel)
              .font(.caption2)
              .foregroundStyle(.secondary)
          } icon: {
            Image(systemName: "stopwatch")
              .foregroundStyle(Color(red: 0.29, green: 0.82, blue: 0.49))
          }
          .appLanguage(language)
        }
        DynamicIslandExpandedRegion(.trailing) {
          StopwatchControlsView(state: context.state, compact: true)
            .appLanguage(language)
        }
        DynamicIslandExpandedRegion(.bottom) {
          StopwatchTimerText(state: context.state)
            .font(.system(size: 44, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .frame(maxWidth: .infinity, alignment: .center)
            .appLanguage(language)
        }
      } compactLeading: {
        Image(systemName: "stopwatch")
          .foregroundStyle(Color(red: 0.29, green: 0.82, blue: 0.49))
      } compactTrailing: {
        // No explicit width — let the Dynamic Island shrink/grow the pill to
        // fit the timer. The previous `frame(maxWidth: 56, alignment: .trailing)`
        // pinned the trailing slot at 56pt and right-aligned the text inside,
        // which is what produced the wide gap between the icon and short
        // timer values (e.g. "0:13") before the hours digit appeared.
        StopwatchTimerText(state: context.state)
          .monospacedDigit()
          .appLanguage(language)
      } minimal: {
        Image(systemName: "stopwatch")
          .foregroundStyle(Color(red: 0.29, green: 0.82, blue: 0.49))
      }
    }
  }
}

/// The few `snapshot.json` fields the Live Activity reads, decoded without
/// the rest of the widget snapshot: both presentations load it on every update.
private struct StopwatchSnapshot: Decodable {
  private struct Strings: Decodable {
    let timerLabel: String?
  }

  let version: Int
  private let rtl: Bool?
  private let numberLocale: String?
  private let strings: Strings

  /// Before the first snapshot, the bundled word and the system's direction.
  static func load() -> (timerLabel: String, language: AppLanguage?) {
    let snapshot = SnapshotLoader.load(StopwatchSnapshot.self, version: \.version)
    return (
      snapshot?.strings.timerLabel ?? L10n.t("timer"),
      snapshot.map { AppLanguage(rtl: $0.rtl, numberLocale: $0.numberLocale) }
    )
  }
}

// MARK: - Views

@available(iOS 16.2, *)
private struct StopwatchLockScreenView: View {
  let state: StopwatchAttributes.ContentState
  let label: String

  var body: some View {
    HStack {
      VStack(alignment: .leading, spacing: 4) {
        Label(label, systemImage: "stopwatch")
          .font(.caption)
          .foregroundStyle(.secondary)
        StopwatchTimerText(state: state)
          .font(.system(size: 52, weight: .semibold, design: .rounded))
          .monospacedDigit()
          .foregroundStyle(.white)
      }
      Spacer()
      StopwatchControlsView(state: state, compact: false)
    }
    .padding()
  }
}

@available(iOS 16.2, *)
private struct StopwatchTimerText: View {
  let state: StopwatchAttributes.ContentState

  var body: some View {
    // One single `Text(timerInterval:)` is used for both running and paused
    // states. When paused, `pauseTime` freezes the displayed elapsed at the
    // accumulated total. Keeping a single view tree (instead of swapping
    // between `Text(timerInterval:)` and a static `Text(...)`) avoids a
    // visible flicker / double-render when SwiftUI would otherwise diff the
    // subtree between runs.
    let now = Date()
    let accumulatedSec = state.accumulatedMs / 1000
    let effectiveStart: Date
    let pauseTime: Date?

    if state.isRunning, let startedAt = state.startedAt {
      let segmentSec = max(0, now.timeIntervalSince1970 - startedAt)
      effectiveStart = now.addingTimeInterval(-(accumulatedSec + segmentSec))
      pauseTime = nil
    } else {
      effectiveStart = now.addingTimeInterval(-accumulatedSec)
      pauseTime = now
    }

    return Text(
      timerInterval: effectiveStart...Date.distantFuture,
      pauseTime: pauseTime,
      countsDown: false,
      showsHours: true
    )
  }
}

@available(iOS 16.2, *)
private struct StopwatchControlsView: View {
  let state: StopwatchAttributes.ContentState
  let compact: Bool

  var body: some View {
    HStack(spacing: compact ? 6 : 12) {
      if #available(iOS 17.0, *) {
        if state.isRunning {
          Button(intent: StopwatchPauseIntent()) {
            Image(systemName: "pause.fill")
          }
          .tint(.orange)
        } else {
          Button(intent: StopwatchResumeIntent()) {
            Image(systemName: "play.fill")
          }
          .tint(.green)
        }
        Button(intent: StopwatchStopIntent()) {
          Image(systemName: "stop.fill")
        }
        .tint(.red)
      }
    }
    .buttonStyle(.bordered)
    .buttonBorderShape(.circle)
    .labelStyle(.iconOnly)
    .controlSize(compact ? .regular : .large)
  }
}
