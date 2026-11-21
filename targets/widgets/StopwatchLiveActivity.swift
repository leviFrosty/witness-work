import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// Live Activity for the stopwatch. Appears on the lock screen and in the
/// Dynamic Island. Buttons (pause/resume/stop) are driven by
/// `LiveActivityIntent`s — taps execute in-process without unlocking the
/// device or foregrounding the app.
///
/// The Dynamic Island follows the Clock app's stopwatch: in the compact
/// presentation the glyph sits at the leading edge and the time at the
/// trailing edge, both in the accent color, with an accent keyline, and the
/// pill is only as wide as the time. The Clock app's hundredths are left out.
/// Where the island is limited in width, only the glyph shows.
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
      let accent = snapshot.accent
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label {
            Text(snapshot.timerLabel)
              .font(.caption2)
              .foregroundStyle(.secondary)
          } icon: {
            Image(systemName: "stopwatch")
              .foregroundStyle(accent)
          }
          .appLanguage(language)
        }
        DynamicIslandExpandedRegion(.trailing) {
          StopwatchControlsView(state: context.state, compact: true)
            .appLanguage(language)
        }
        DynamicIslandExpandedRegion(.bottom) {
          StopwatchTimerText(state: context.state, alignment: .center)
            .font(.system(size: 44, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(accent)
            .frame(maxWidth: .infinity, alignment: .center)
            .appLanguage(language)
        }
      } compactLeading: {
        StopwatchGlyph()
          .foregroundStyle(accent)
      } compactTrailing: {
        StopwatchCompactTime(state: context.state, accent: accent, language: language)
      } minimal: {
        StopwatchGlyph()
          .foregroundStyle(accent)
      }
      .keylineTint(accent)
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
  private let accentColor: String?
  private let strings: Strings

  /// Before the first snapshot, the bundled word, the system's direction and
  /// the brand accent.
  static func load() -> (timerLabel: String, language: AppLanguage?, accent: Color) {
    let snapshot = SnapshotLoader.load(StopwatchSnapshot.self, version: \.version)
    return (
      snapshot?.strings.timerLabel ?? L10n.t("timer"),
      snapshot.map { AppLanguage(rtl: $0.rtl, numberLocale: $0.numberLocale) },
      snapshot?.accentColor.flatMap { Color(widgetHex: $0) } ?? WidgetColor.brandAccent
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
        StopwatchTimerText(state: state, alignment: .leading)
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

/// The stopwatch glyph the compact and minimal presentations lead with, at
/// the size the Clock app's stopwatch draws its own.
private struct StopwatchGlyph: View {
  var body: some View {
    Image(systemName: "stopwatch")
      .font(.system(size: 19, weight: .medium))
  }
}

/// The compact presentation's time, at the Clock app's stopwatch size. Left
/// out where the Dynamic Island is limited in width (iPhone Duo's side bar,
/// iPhone in landscape, beside other Live Activities), where it would be
/// truncated: Apple has the trailing view empty there, and the system hides it
/// and keeps the glyph.
@available(iOS 16.2, *)
private struct StopwatchCompactTime: View {
  let state: StopwatchAttributes.ContentState
  let accent: Color
  let language: AppLanguage?

  var body: some View {
    if #available(iOS 27.0, *) {
      HiddenWhenDynamicIslandLimited { time }
    } else {
      time
    }
  }

  private var time: some View {
    StopwatchTimerText(state: state)
      .font(.system(size: 13, weight: .medium))
      .monospacedDigit()
      .foregroundStyle(accent)
      .padding(.trailing, 2)
      .appLanguage(language)
  }
}

@available(iOS 27.0, *)
private struct HiddenWhenDynamicIslandLimited<Content: View>: View {
  @Environment(\.isDynamicIslandLimitedInWidth) private var isLimited
  @ViewBuilder let content: Content

  var body: some View {
    if !isLimited {
      content
    }
  }
}

/// The elapsed time, `4:02` and from an hour `1:04:02`, as wide as the time
/// it shows so the Dynamic Island hugs it. `alignment` places a shorter time
/// in the width a running stopwatch keeps (`4:02` in `00:00`).
@available(iOS 16.2, *)
private struct StopwatchTimerText: View {
  let state: StopwatchAttributes.ContentState
  var alignment: TextAlignment = .trailing

  var body: some View {
    let now = Date()
    let elapsed = state.elapsedMs(now: now) / 1000
    let start = now.addingTimeInterval(-elapsed)
    let room = state.roomForHours(now: now)

    if state.isRunning {
      // `Text(timerInterval:)` takes the width of the longest time its range
      // allows, wider than the island. So it's laid out over the widest time
      // this layout shows, and the Activity goes stale when that changes
      // (`hoursFieldDate`) so the system lays it out again. It ticks on the
      // Lock Screen too, where `.stopwatch(startingAt:)` shows `27:--`.
      Text(verbatim: room.tensOfHours ? "00:00:00" : room.hours ? "0:00:00" : "00:00")
        .hidden()
        .overlay(alignment: Alignment(horizontal: alignment.horizontal, vertical: .center)) {
          Text(timerInterval: start...Date.distantFuture, countsDown: false)
            .multilineTextAlignment(alignment)
        }
    } else {
      Text(
        Duration.seconds(elapsed.rounded(.down)),
        format: .time(
          pattern: elapsed >= StopwatchAttributes.ContentState.hoursFieldSeconds
            ? .hourMinuteSecond : .minuteSecond
        )
      )
    }
  }
}

private extension TextAlignment {
  var horizontal: HorizontalAlignment {
    switch self {
    case .leading: .leading
    case .center: .center
    case .trailing: .trailing
    }
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
