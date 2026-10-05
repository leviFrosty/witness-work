import SwiftUI
import WatchKit

struct HomeView: View {
  @Environment(WatchModel.self) private var model
  let snapshot: WatchSnapshot

  var body: some View {
    List {
      if !snapshot.isCurrent() {
        Text(L10n.t("watchStale", snapshot))
          .font(.footnote)
          .foregroundStyle(.secondary)
      }

      if snapshot.showsTimeEntry {
        if snapshot.isCurrent() {
          ProgressSection(snapshot: snapshot)
        }
        if let timer = model.timer {
          TimerSection(snapshot: snapshot, timer: timer)
        }
        NavigationLink {
          AddTimeView(snapshot: snapshot)
        } label: {
          Label(L10n.t("addTime", snapshot), systemImage: "plus")
        }
      } else {
        ReportStatusSection(snapshot: snapshot)
      }

      if model.isSyncing {
        Label(L10n.t("watchSyncing", snapshot), systemImage: "arrow.triangle.2.circlepath")
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
    }
  }
}

private struct ProgressSection: View {
  let snapshot: WatchSnapshot

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(L10n.t("month", snapshot))
        .font(.caption2)
        .textCase(.uppercase)
        .foregroundStyle(.secondary)
      HStack(alignment: .firstTextBaseline, spacing: 2) {
        Text(snapshot.monthFormatted)
          .font(.title2.bold())
        // The goal is whole hours the user entered.
        if snapshot.goalHours > 0 {
          Text(verbatim: "/\(snapshot.goalHours)")
            .foregroundStyle(.secondary)
        }
      }
      if snapshot.goalHours > 0 {
        ProgressView(value: min(snapshot.progress, 1))
          .tint(.accentColor)
      }
      if let projected = snapshot.projectedText {
        Text(projected)
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
    }
    .accessibilityElement(children: .combine)
  }
}

private struct TimerSection: View {
  @Environment(WatchModel.self) private var model
  let snapshot: WatchSnapshot
  let timer: TimerSnapshot
  @State private var isSending = false

  private var canSave: Bool { !timer.isRunning && timer.elapsedMs() >= 60_000 }

  var body: some View {
    Group {
      VStack(alignment: .leading, spacing: 4) {
        Text(L10n.t("timer", snapshot))
          .font(.caption2)
          .textCase(.uppercase)
          .foregroundStyle(.secondary)
        if timer.isRunning {
          Text(timerInterval: timer.effectiveStartDate()...Date.distantFuture, countsDown: false)
            .font(.title3.monospacedDigit())
        } else {
          // Same shape as the running timer above: no hours under an hour.
          let elapsed = Duration.milliseconds(timer.elapsedMs())
          Text(
            elapsed,
            format: .time(pattern: elapsed < .seconds(3600) ? .minuteSecond : .hourMinuteSecond)
          )
          .font(.title3.monospacedDigit())
        }
      }

      Button {
        toggle()
      } label: {
        Label(
          L10n.t(timer.isRunning ? "timerPauseAction" : "timerStartAction", snapshot),
          systemImage: timer.isRunning ? "pause.fill" : "play.fill")
      }
      .disabled(isSending)

      if canSave {
        NavigationLink {
          AddTimeView(
            snapshot: snapshot,
            hours: Int(timer.elapsedMs() / 3_600_000),
            minutes: Int(timer.elapsedMs() / 60_000) % 60,
            fromTimer: true)
        } label: {
          Label(L10n.t("timerSaveAction", snapshot), systemImage: "square.and.arrow.down")
        }
      }
    }
  }

  private func toggle() {
    isSending = true
    Task {
      do {
        try await model.setTimer(timer.isRunning ? .pause : .start, origin: .app)
        WKInterfaceDevice.current().play(.click)
      } catch {
        model.show(error)
      }
      isSending = false
    }
  }
}

/// Regular Publishers who don't log hours report whether they shared in the
/// ministry this month — the same check-off as the iPhone's checkbox card.
private struct ReportStatusSection: View {
  @Environment(WatchModel.self) private var model
  let snapshot: WatchSnapshot

  var body: some View {
    let state = snapshot.isCurrent() ? snapshot.publisherState() : "unreported"
    if state == "unreported" && !model.hasPendingEntryToday {
      Button {
        Task {
          await model.addEntry(hours: 0, minutes: 0, categoryId: nil, origin: .app)
          WKInterfaceDevice.current().play(.success)
        }
      } label: {
        Label(L10n.line("sharedTheGoodNews", snapshot), systemImage: "circle")
      }
    } else {
      VStack(alignment: .leading, spacing: 4) {
        Label(L10n.line("sharedTheGoodNews", snapshot), systemImage: "checkmark.circle.fill")
          .foregroundStyle(Color.accentColor)
        if state == "reportedToday" || model.hasPendingEntryToday {
          Text(L10n.t("reportedToday", snapshot))
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }
      .accessibilityElement(children: .combine)
    }
  }
}
