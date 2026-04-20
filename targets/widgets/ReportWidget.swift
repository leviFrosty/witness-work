import SwiftUI
import WidgetKit

// MARK: - Timeline

private struct ReportEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
}

private struct ReportProvider: TimelineProvider {
  func placeholder(in context: Context) -> ReportEntry {
    ReportEntry(date: Date(), snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (ReportEntry) -> Void) {
    completion(ReportEntry(date: Date(), snapshot: SnapshotLoader.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<ReportEntry>) -> Void) {
    let entry = ReportEntry(date: Date(), snapshot: SnapshotLoader.load())
    // Re-check hourly even if the app never reloads us — covers the case
    // where the user never opens the app and background fetch doesn't fire.
    let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

// MARK: - Helpers

/// Drops the trailing `.0` for whole numbers so the badge doesn't read
/// "5.0 hrs/day". Mirrors `_.round(x, 1)` formatting from HourEntryCard.
private func formatHours(_ value: Double) -> String {
  if value == value.rounded() { return String(Int(value)) }
  return String(format: "%.1f", value)
}

// MARK: - Hours mode
//
// Always renders the current month — never today or week. Two layouts:
//
//   Small  → eyebrow + progress bar + big number + encouragement.
//            Drops the hrs/day pill and Add Time button: a small widget can
//            only fit one focal element without crowding, and the progress
//            bar already encodes the same information the pill would.
//
//   Medium → wide reorient. Same pieces as the in-app HourEntryCard, laid
//            out as two columns (stats on the left, pill + Add Time on the
//            right) so the wider canvas isn't half empty.

private struct HoursReportView: View {
  let snapshot: WidgetSnapshot
  let family: WidgetFamily

  var body: some View {
    switch family {
    case .systemSmall:  SmallMonthCard(snapshot: snapshot)
    default:            MediumMonthCard(snapshot: snapshot)
    }
  }
}

private struct MonthEyebrow: View {
  let label: String
  var body: some View {
    Text(label.uppercased())
      .font(.caption2)
      .fontWeight(.semibold)
      .tracking(0.5)
      .foregroundStyle(.secondary)
  }
}

private struct BigHoursNumber: View {
  let formatted: String
  let goalHours: Int
  let size: CGFloat

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 1) {
      Text(formatted)
        .font(.system(size: size, weight: .bold, design: .rounded))
        .minimumScaleFactor(0.6)
        .lineLimit(1)
      Text("/\(goalHours)")
        .font(.system(size: size * 0.38, weight: .semibold, design: .rounded))
        .foregroundStyle(.tertiary)
    }
  }
}

/// Tinted CTA — accent text on translucent accent fill, matching iOS's
/// native `.borderedProminent` tint style in widgets.
private struct AddTimeButton: View {
  let label: String
  @Environment(\.widgetAccent) private var accent

  var body: some View {
    Link(destination: WidgetURLs.addTime) {
      HStack(spacing: 4) {
        Image(systemName: "plus")
          .font(.system(size: 11, weight: .bold))
        Text(label)
          .font(.system(size: 13, weight: .semibold))
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
      .foregroundStyle(accent)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 10)
      .background(
        RoundedRectangle(cornerRadius: WidgetRadius.md, style: .continuous)
          .fill(accent.opacity(0.15))
      )
    }
  }
}

/// Subtle tinted capsule — tinted text on tinted fill for a quieter
/// accent than the solid-color pill it replaced. Mirrors the visual
/// weight of iOS status pills (e.g. Reminders "Today").
private struct PaceBadge: View {
  let snapshot: WidgetSnapshot
  @Environment(\.widgetAccent) private var accent

  var body: some View {
    let report = snapshot.report
    let strings = snapshot.strings
    if let aheadBehind = report.aheadBehindMinutes {
      let isAhead = aheadBehind >= 0
      let tint = isAhead ? accent : Color.orange
      pill(
        icon: isAhead ? "arrow.up.right" : "arrow.down.right",
        text: isAhead ? strings.aheadOfScheduleLabel : strings.behindScheduleLabel,
        tint: tint
      )
    } else if let perDay = report.hoursPerDayNeeded {
      pill(
        icon: "target",
        text: "\(formatHours(perDay)) \(strings.hoursPerDayToGoalSuffix)",
        tint: accent
      )
    }
  }

  private func pill(icon: String, text: String, tint: Color) -> some View {
    HStack(spacing: 3) {
      Image(systemName: icon)
        .font(.system(size: 9, weight: .bold))
      Text(text)
        .font(.system(size: 11, weight: .semibold))
        .lineLimit(1)
    }
    .foregroundStyle(tint)
    .padding(.horizontal, 8)
    .padding(.vertical, 4)
    .background(Capsule().fill(tint.opacity(0.15)))
  }
}

// MARK: Small (always month)
//
// Left-aligned vertical hierarchy: eyebrow → hero number → caption → progress.
// Progress moves to the bottom so it acts as an at-a-glance indicator without
// competing with the hero number for attention (Apple Fitness widget pattern).

private struct SmallMonthCard: View {
  let snapshot: WidgetSnapshot
  @Environment(\.widgetAccent) private var accent

  var body: some View {
    let report = snapshot.report
    let strings = snapshot.strings
    let progress = min(max(report.progress, 0), 1)

    VStack(alignment: .leading, spacing: 0) {
      MonthEyebrow(label: strings.monthLabel)

      Spacer(minLength: 0)

      BigHoursNumber(
        formatted: report.monthHoursFormatted,
        goalHours: report.goalHours,
        size: 46
      )

      Text(strings.encouragementPhrase)
        .font(.footnote)
        .fontWeight(.medium)
        .foregroundStyle(.secondary)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .padding(.top, 2)

      Spacer(minLength: 0)

      ProgressView(value: progress)
        .progressViewStyle(.linear)
        .tint(accent)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(WidgetURLs.addTime)
  }
}

// MARK: Medium (always month, horizontal)
//
// Header row anchors context (label + pace badge), progress bar spans the full
// width as the visual connector, and the body splits into a hero-number
// column and a single tappable CTA. The pace badge sits in the header rather
// than next to the button so the right column has one clear action instead of
// two stacked elements competing for the eye.

private struct MediumMonthCard: View {
  let snapshot: WidgetSnapshot
  @Environment(\.widgetAccent) private var accent

  var body: some View {
    let report = snapshot.report
    let strings = snapshot.strings
    let progress = min(max(report.progress, 0), 1)

    VStack(alignment: .leading, spacing: WidgetSpacing.lg) {
      HStack(alignment: .center, spacing: WidgetSpacing.md) {
        MonthEyebrow(label: strings.monthLabel)
        Spacer(minLength: WidgetSpacing.md)
        PaceBadge(snapshot: snapshot)
      }

      ProgressView(value: progress)
        .progressViewStyle(.linear)
        .tint(accent)

      Spacer(minLength: 0)

      HStack(alignment: .bottom, spacing: WidgetSpacing.xl) {
        VStack(alignment: .leading, spacing: 2) {
          BigHoursNumber(
            formatted: report.monthHoursFormatted,
            goalHours: report.goalHours,
            size: 44
          )
          Text(strings.encouragementPhrase)
            .font(.footnote)
            .fontWeight(.medium)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
        }

        Spacer(minLength: 0)

        AddTimeButton(label: strings.addTimeLabel)
          .frame(maxWidth: 130)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

// MARK: - Checkbox / Publisher mode (state machine)
//
// Three states the JS computes for us:
//
//   .unreported        → checkbox CTA, taps "Shared the Good News" action
//   .reportedToday     → confirmation card for the rest of today only
//   .reportedThisMonth → conversations + studies running totals for the month
//
// The state advances on its own as the day rolls over, so the widget actually
// stays useful for publishers throughout the month instead of being a static
// "you reported" sticker after day one.

private struct CheckboxReportView: View {
  let snapshot: WidgetSnapshot
  let family: WidgetFamily

  var body: some View {
    switch snapshot.report.publisherState {
    case .unreported:
      UnreportedCard(snapshot: snapshot, family: family)
    case .reportedToday:
      ReportedTodayCard(snapshot: snapshot, family: family)
    case .reportedThisMonth:
      ConversationsThisMonthCard(snapshot: snapshot, family: family)
    }
  }
}

private struct UnreportedCard: View {
  let snapshot: WidgetSnapshot
  let family: WidgetFamily
  @Environment(\.widgetAccent) private var accent

  var body: some View {
    let strings = snapshot.strings
    // Tap → opens app → SharedGoodNewsListener adds a 0h0m report and
    // plays confetti, mirroring the in-app checkbox card behavior.
    VStack(spacing: WidgetSpacing.lg) {
      Spacer()
      Image(systemName: "square")
        .font(.system(size: family == .systemSmall ? 36 : 48))
        .foregroundColor(.white)
      Text(strings.sharedGoodNewsLabel)
        .font(.system(size: family == .systemSmall ? 12 : 14, weight: .bold))
        .foregroundColor(.white)
        .multilineTextAlignment(.center)
        .lineLimit(2)
        .minimumScaleFactor(0.8)
      Spacer()
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(WidgetSpacing.md)
    .background(
      RoundedRectangle(cornerRadius: WidgetRadius.md)
        .fill(accent)
    )
    .widgetURL(WidgetURLs.sharedGoodNews)
  }
}

private struct ReportedTodayCard: View {
  let snapshot: WidgetSnapshot
  let family: WidgetFamily
  @Environment(\.widgetAccent) private var accent

  var body: some View {
    let strings = snapshot.strings
    VStack(spacing: WidgetSpacing.md) {
      Spacer()
      Image(systemName: "checkmark.seal.fill")
        .font(.system(size: family == .systemSmall ? 44 : 60))
        .foregroundColor(accent)
      Text(strings.reportedTodayLabel)
        .font(.system(size: family == .systemSmall ? 13 : 15, weight: .bold))
        .foregroundColor(.primary)
        .multilineTextAlignment(.center)
      Text(strings.encouragementPhrase)
        .font(.system(size: 11))
        .foregroundColor(.secondary)
        .multilineTextAlignment(.center)
        .lineLimit(2)
        .minimumScaleFactor(0.85)
      Spacer()
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    // Publishers can't access Add Time, so route the already-checked
    // state to Home instead of the (inaccessible) Add Time screen.
    .widgetURL(WidgetURLs.home)
  }
}

private struct ConversationsThisMonthCard: View {
  let snapshot: WidgetSnapshot
  let family: WidgetFamily
  @Environment(\.widgetAccent) private var accent

  var body: some View {
    let report = snapshot.report
    let strings = snapshot.strings
    VStack(alignment: .leading, spacing: WidgetSpacing.lg) {
      Text(strings.monthLabel.uppercased())
        .font(.system(size: 10, weight: .bold))
        .foregroundColor(.secondary)

      Spacer(minLength: 0)

      // Conversations
      VStack(alignment: .leading, spacing: WidgetSpacing.xs) {
        Text("\(report.monthConversationCount)")
          .font(.system(size: family == .systemSmall ? 32 : 40, weight: .bold))
          .lineLimit(1)
          .minimumScaleFactor(0.6)
        Text(strings.conversationsThisMonthLabel)
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(.secondary)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }

      // Bible studies — only render when there's at least one. A zero here
      // would just be discouraging filler.
      if report.monthBibleStudyCount > 0 {
        HStack(spacing: WidgetSpacing.md) {
          Image(systemName: "book.closed.fill")
            .font(.caption)
            .foregroundColor(accent)
          Text("\(report.monthBibleStudyCount) \(strings.studiesThisMonthLabel)")
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(.primary)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
      }

      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(WidgetURLs.home)
  }
}

// MARK: - Lock screen accessory views
//
// iOS 16+ introduced lock screen widget families (`accessoryCircular`,
// `accessoryRectangular`). They share the same snapshot data as the home
// screen widgets — only the view layer differs. They render in a monochrome
// tint so solid color fills are avoided; progress is communicated via a
// Gauge or a native ProgressView which the system tints automatically.

private struct CircularReportView: View {
  let snapshot: WidgetSnapshot

  var body: some View {
    let report = snapshot.report

    switch report.mode {
    case .hours:
      Gauge(value: min(max(report.progress, 0), 1)) {
        EmptyView()
      } currentValueLabel: {
        VStack(spacing: 0) {
          Text(compactHours(report.monthMinutes))
            .font(.system(size: 14, weight: .bold))
          Text("/\(report.goalHours)")
            .font(.system(size: 8, weight: .semibold))
        }
      }
      .gaugeStyle(.accessoryCircularCapacity)
      .widgetURL(WidgetURLs.addTime)

    case .checkbox:
      switch report.publisherState {
      case .unreported:
        VStack(spacing: 1) {
          Image(systemName: "square")
            .font(.system(size: 22, weight: .semibold))
          Text("Report")
            .font(.system(size: 8, weight: .semibold))
        }
        .widgetURL(WidgetURLs.sharedGoodNews)

      case .reportedToday:
        Image(systemName: "checkmark.seal.fill")
          .font(.system(size: 28))
          .widgetURL(WidgetURLs.home)

      case .reportedThisMonth:
        VStack(spacing: 0) {
          Text("\(report.monthConversationCount)")
            .font(.system(size: 18, weight: .bold))
            .minimumScaleFactor(0.6)
            .lineLimit(1)
          Image(systemName: "bubble.left.and.bubble.right.fill")
            .font(.system(size: 9))
        }
        .widgetURL(WidgetURLs.home)
      }
    }
  }

  /// Shortest possible hours string that still fits in the 45pt circular
  /// gauge. Uses integer hours for anything ≥ 10 and one decimal otherwise.
  private func compactHours(_ minutes: Int) -> String {
    let hours = Double(minutes) / 60
    if hours >= 10 || hours == hours.rounded() {
      return String(Int(hours.rounded()))
    }
    return String(format: "%.1f", hours)
  }
}

private struct RectangularReportView: View {
  let snapshot: WidgetSnapshot

  var body: some View {
    let report = snapshot.report
    let strings = snapshot.strings

    switch report.mode {
    case .hours:
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 4) {
          Text(strings.monthLabel.uppercased())
            .font(.system(size: 9, weight: .bold))
          Spacer(minLength: 0)
          Text("\(report.monthHoursFormatted) / \(report.goalHours)")
            .font(.system(size: 12, weight: .bold))
            .lineLimit(1)
        }
        ProgressView(value: min(max(report.progress, 0), 1))
          .progressViewStyle(.linear)
        Text(strings.encouragementPhrase)
          .font(.system(size: 10))
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
      .widgetURL(WidgetURLs.addTime)

    case .checkbox:
      switch report.publisherState {
      case .unreported:
        HStack(spacing: 6) {
          Image(systemName: "square")
            .font(.title2)
          VStack(alignment: .leading, spacing: 1) {
            Text(strings.sharedGoodNewsLabel)
              .font(.system(size: 12, weight: .bold))
              .lineLimit(2)
              .minimumScaleFactor(0.8)
          }
          Spacer(minLength: 0)
        }
        .widgetURL(WidgetURLs.sharedGoodNews)

      case .reportedToday:
        HStack(spacing: 6) {
          Image(systemName: "checkmark.seal.fill")
            .font(.title)
          VStack(alignment: .leading, spacing: 1) {
            Text(strings.reportedTodayLabel)
              .font(.system(size: 12, weight: .bold))
              .lineLimit(1)
            Text(strings.encouragementPhrase)
              .font(.system(size: 10))
              .lineLimit(1)
              .minimumScaleFactor(0.8)
          }
          Spacer(minLength: 0)
        }
        .widgetURL(WidgetURLs.home)

      case .reportedThisMonth:
        VStack(alignment: .leading, spacing: 1) {
          Text(strings.monthLabel.uppercased())
            .font(.system(size: 9, weight: .bold))
          HStack(alignment: .lastTextBaseline, spacing: 4) {
            Text("\(report.monthConversationCount)")
              .font(.system(size: 18, weight: .bold))
            Text(strings.conversationsThisMonthLabel)
              .font(.system(size: 10))
              .lineLimit(1)
              .minimumScaleFactor(0.7)
          }
          if report.monthBibleStudyCount > 0 {
            Text(
              "\(report.monthBibleStudyCount) \(strings.studiesThisMonthLabel)"
            )
            .font(.system(size: 10))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
          }
        }
        .widgetURL(WidgetURLs.home)
      }
    }
  }
}

// MARK: - Root view

private struct ReportWidgetView: View {
  let entry: ReportEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    Group {
      if let snapshot = entry.snapshot {
        switch family {
        case .accessoryCircular:
          CircularReportView(snapshot: snapshot)
        case .accessoryRectangular:
          RectangularReportView(snapshot: snapshot)
        default:
          switch snapshot.report.mode {
          case .hours:
            HoursReportView(snapshot: snapshot, family: family)
          case .checkbox:
            CheckboxReportView(snapshot: snapshot, family: family)
          }
        }
      } else {
        // Placeholder when the snapshot hasn't been written yet (cold install
        // before the app has launched once).
        placeholder
      }
    }
    .environment(\.widgetAccent, entry.snapshot?.resolvedAccent ?? WidgetColor.brandAccent)
    .containerBackground(.background, for: .widget)
  }

  @ViewBuilder private var placeholder: some View {
    switch family {
    case .accessoryCircular:
      Image(systemName: "clock")
        .font(.system(size: 20))
    case .accessoryRectangular:
      Text("—")
        .font(.system(size: 14, weight: .bold))
    default:
      VStack {
        Spacer()
        Text("—")
          .font(.system(size: 32, weight: .bold))
          .foregroundColor(.secondary)
        Spacer()
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}

// MARK: - Widget

struct ReportWidget: Widget {
  let kind: String = "ReportWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: ReportProvider()) { entry in
      ReportWidgetView(entry: entry)
    }
    .configurationDisplayName("Service Report")
    .description("This month's hours toward your goal.")
    .supportedFamilies([
      .systemSmall,
      .systemMedium,
      .accessoryCircular,
      .accessoryRectangular,
    ])
  }
}
