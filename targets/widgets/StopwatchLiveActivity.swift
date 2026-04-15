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
@available(iOS 16.2, *)
struct StopwatchLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: StopwatchAttributes.self) { context in
      // Lock screen + banner presentation.
      StopwatchLockScreenView(state: context.state)
        .activityBackgroundTint(Color.black.opacity(0.6))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label {
            Text("Timer")
              .font(.caption2)
              .foregroundStyle(.secondary)
          } icon: {
            Image(systemName: "stopwatch")
              .foregroundStyle(Color(red: 0.29, green: 0.82, blue: 0.49))
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          StopwatchControlsView(state: context.state, compact: true)
        }
        DynamicIslandExpandedRegion(.bottom) {
          StopwatchTimerText(state: context.state)
            .font(.system(size: 44, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .frame(maxWidth: .infinity, alignment: .center)
        }
      } compactLeading: {
        Image(systemName: "stopwatch")
          .foregroundStyle(Color(red: 0.29, green: 0.82, blue: 0.49))
      } compactTrailing: {
        StopwatchTimerText(state: context.state)
          .monospacedDigit()
          .frame(maxWidth: 56)
      } minimal: {
        Image(systemName: "stopwatch")
          .foregroundStyle(Color(red: 0.29, green: 0.82, blue: 0.49))
      }
    }
  }
}

// MARK: - Views

@available(iOS 16.2, *)
private struct StopwatchLockScreenView: View {
  let state: StopwatchAttributes.ContentState

  var body: some View {
    HStack {
      VStack(alignment: .leading, spacing: 4) {
        Label("Timer", systemImage: "stopwatch")
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

// MARK: - Formatting

private func formatElapsed(ms: Double) -> String {
  let totalSeconds = Int(ms / 1000)
  let hours = totalSeconds / 3600
  let minutes = (totalSeconds % 3600) / 60
  let seconds = totalSeconds % 60
  return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
}
