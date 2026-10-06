import SwiftUI
import WatchKit

struct HomeView: View {
  @Environment(WatchModel.self) private var model
  let snapshot: WatchSnapshot

  var body: some View {
    // Up Next and the month move on with the clock, not only with new data.
    TimelineView(.everyMinute) { timeline in
      let progress = model.progress(at: timeline.date)
      List {
        if progress == nil {
          Text(L10n.t("watchStale", snapshot))
            .font(.footnote)
            .foregroundStyle(.secondary)
        }

        if progress?.showsTimeEntry ?? snapshot.showsTimeEntry {
          if let progress {
            ProgressSection(snapshot: snapshot, progress: progress)
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
          ReportStatusSection(snapshot: snapshot, progress: progress)
        }

        UpNextSection(snapshot: snapshot, date: timeline.date)

        if model.isSyncing {
          Label(L10n.t("watchSyncing", snapshot), systemImage: "arrow.triangle.2.circlepath")
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }
    }
  }
}

private struct ProgressSection: View {
  let snapshot: WatchSnapshot
  let progress: MonthProgress

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(progress.monthName)
        .font(.caption2)
        .textCase(.uppercase)
        .foregroundStyle(.secondary)
      HStack(alignment: .firstTextBaseline, spacing: 2) {
        Text(progress.formatted)
          .font(.title2.bold())
        // The goal is whole hours the user entered.
        if progress.goalHours > 0 {
          Text(verbatim: "/\(progress.goalHours)")
            .foregroundStyle(.secondary)
        }
      }
      if let fraction = progress.fraction {
        PaceBar(fraction: fraction, paceFraction: progress.paceFraction)
          .padding(.vertical, 2)
      }
      if progress.goalReached {
        Label(L10n.t("goalReached", snapshot), systemImage: "checkmark.circle.fill")
          .font(.footnote)
          .foregroundStyle(Color.accentColor)
      } else if let pace = progress.paceText {
        Text(pace)
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
  /// Counts the marker while it's still on its way to the iPhone.
  let progress: MonthProgress?

  var body: some View {
    let state = progress?.publisherState ?? "unreported"
    if state == "unreported" {
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
        if state == "reportedToday" {
          Text(L10n.t("reportedToday", snapshot))
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }
      .accessibilityElement(children: .combine)
    }
  }
}

/// The next Follow-up or Plan; opens it with Directions and the timer.
private struct UpNextSection: View {
  /// Wrist down: the screen may be seen by the person you're talking with.
  @Environment(\.isLuminanceReduced) private var hidesNames
  let snapshot: WatchSnapshot
  let date: Date

  var body: some View {
    let label = Text(L10n.t("watchUpNext", snapshot))
      .font(.caption2)
      .textCase(.uppercase)
      .foregroundStyle(.secondary)
    if let item = UpNext.items(snapshot, at: date).first {
      NavigationLink {
        UpNextView(itemId: item.id)
      } label: {
        VStack(alignment: .leading, spacing: 2) {
          label
          Label(UpNext.heading(item, at: date, snapshot), systemImage: UpNext.symbol(item))
            .font(.footnote)
            .foregroundStyle(Color.accentColor)
          Text(UpNext.title(item, hidesNames: hidesNames, snapshot))
            .font(.headline)
            .lineLimit(2)
            .privacySensitive(item.kind == .followUp)
          if let detail = UpNext.detail(item, hidesNames: hidesNames) {
            Text(detail)
              .font(.footnote)
              .foregroundStyle(.secondary)
              .lineLimit(2)
              .privacySensitive(item.kind == .followUp)
          }
        }
        .accessibilityElement(children: .combine)
      }
    } else {
      VStack(alignment: .leading, spacing: 2) {
        label
        Text(L10n.t("watchNothingScheduled", snapshot))
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
      .accessibilityElement(children: .combine)
    }
  }
}
