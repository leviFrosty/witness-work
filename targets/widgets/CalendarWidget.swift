import SwiftUI
import WidgetKit

// MARK: - Timeline
//
// The grid itself is pre-built by JS (see `buildCalendar.ts`), so Swift only
// branches on widget family: medium renders a single row (the current week)
// and large renders the full six-week month.
//
// Publishers get a locked placeholder; the feature is hidden because they
// don't have an hours goal to chart on the calendar. `snapshot.calendar.locked`
// is the source of truth.

private struct CalendarEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
}

private struct CalendarProvider: TimelineProvider {
  func placeholder(in context: Context) -> CalendarEntry {
    CalendarEntry(date: Date(), snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (CalendarEntry) -> Void) {
    completion(CalendarEntry(date: Date(), snapshot: SnapshotLoader.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<CalendarEntry>) -> Void) {
    let entry = CalendarEntry(date: Date(), snapshot: SnapshotLoader.load())
    // Hourly re-check so the "today" highlight slides to the right cell at
    // midnight even if the app never reloaded the widget.
    let next = Foundation.Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

// MARK: - Cell status
//
// Mirrors `NonPlannedDay` + `getDateStatusColor` in
// `src/components/CalendarDay.tsx`:
//
//   No plan → white by default, green if time was logged. A missed day with
//             no plan stays white — "missed" only applies to planned days.
//   Has plan → white until the date is past, then red (missed), yellow
//              (partial), or green (hit goal).

private struct CellPalette {
  let background: Color
  let foreground: Color
  let noteDot: Color
}

private let blankPalette = CellPalette(
  background: .clear,
  foreground: .primary,
  noteDot: .secondary
)

/// Neutral planned cells render on a muted grey fill so a scheduled future
/// day is visually distinguishable from an empty unplanned day. Mirrors the
/// card/background contrast the in-app calendar gets for free (card behind
/// each cell, `theme.colors.background` on the cell itself).
private let plannedNeutralPalette = CellPalette(
  background: Color.secondary.opacity(0.2),
  foreground: .primary,
  noteDot: .secondary
)

private func palette(for day: WidgetSnapshot.CalendarDay) -> CellPalette {
  if !day.hasPlan {
    // Matches `NonPlannedDay`: green only when time was logged, otherwise
    // the cell stays blank regardless of whether the date is in the past.
    if day.wentInService {
      return CellPalette(
        background: WidgetColor.accent,
        foreground: .white,
        noteDot: .white
      )
    }
    return blankPalette
  }

  // Planned day — from here on mirrors `getDateStatusColor` exactly.
  if !day.isPast || (day.isToday && !day.wentInService) {
    return plannedNeutralPalette
  }
  if !day.wentInService {
    return CellPalette(
      background: WidgetColor.error,
      foreground: .white,
      noteDot: .white
    )
  }
  if day.hitGoal {
    return CellPalette(
      background: WidgetColor.accent,
      foreground: .white,
      noteDot: .white
    )
  }
  return CellPalette(
    background: WidgetColor.warn,
    foreground: .white,
    noteDot: .white
  )
}

// MARK: - Cell view

private struct CalendarCell: View {
  let day: WidgetSnapshot.CalendarDay
  let isCompact: Bool

  var body: some View {
    // Out-of-month tail/head cells skip the status palette entirely and use
    // the blank palette instead — otherwise a planned-but-missed cross-month
    // day would keep its white foreground while losing its red fill, making
    // the day number invisible on the widget background.
    let colors = day.isCurrentMonth ? palette(for: day) : blankPalette

    ZStack(alignment: .topTrailing) {
      RoundedRectangle(cornerRadius: WidgetRadius.sm)
        .fill(colors.background)
        .overlay(
          RoundedRectangle(cornerRadius: WidgetRadius.sm)
            .stroke(day.isToday ? Color.primary : Color.clear, lineWidth: 2.5)
        )

      VStack(spacing: 0) {
        Text("\(day.day)")
          .font(.system(size: isCompact ? 15 : 13, weight: .semibold))
          .foregroundColor(colors.foreground)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
        if day.hasPlan && !day.plannedText.isEmpty {
          Text(day.plannedText)
            .font(.system(size: isCompact ? 10 : 9, weight: .semibold))
            .foregroundColor(colors.foreground)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .opacity(day.isCurrentMonth ? 1 : 0.35)

      if day.hasNote {
        Circle()
          .fill(colors.noteDot)
          .frame(width: 4, height: 4)
          .padding(2)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    // Disabled cells (previous/next month tail) still get a link so users can
    // jump straight to that day — the screen handles the cross-month date.
  }
}

// MARK: - Shared header

private struct CalendarHeader: View {
  let title: String
  let createPlanLabel: String

  var body: some View {
    HStack(alignment: .center, spacing: WidgetSpacing.md) {
      Text(title)
        .font(.system(size: 13, weight: .bold))
        .foregroundColor(.primary)
        .lineLimit(1)
        .minimumScaleFactor(0.8)

      Spacer(minLength: 0)

      Link(destination: WidgetURLs.createPlan) {
        Image(systemName: "plus")
          .font(.system(size: 11, weight: .bold))
          .foregroundColor(WidgetColor.accent)
          .frame(width: 18, height: 18)
          .background(
            RoundedRectangle(cornerRadius: WidgetRadius.sm)
              .fill(WidgetColor.accentTranslucent)
          )
          .overlay(
            RoundedRectangle(cornerRadius: WidgetRadius.sm)
              .stroke(WidgetColor.accent, lineWidth: 1)
          )
      }
      .accessibilityLabel(createPlanLabel)
    }
  }
}

/// Horizontal gap between adjacent day cells. Tuned to match the in-app
/// calendar's visible breathing room between squares.
private let cellGap: CGFloat = 7

private struct WeekdayRow: View {
  let labels: [String]

  var body: some View {
    HStack(spacing: cellGap) {
      ForEach(0..<labels.count, id: \.self) { i in
        Text(labels[i].uppercased())
          .font(.system(size: 9, weight: .bold))
          .foregroundColor(.secondary)
          .frame(maxWidth: .infinity)
          .lineLimit(1)
          .minimumScaleFactor(0.6)
      }
    }
  }
}

// MARK: - Grid rows

/// Wraps the cell in a per-day deep link. Pulled into its own view so the
/// medium and large layouts share the same tap behavior.
private struct CellLink: View {
  let day: WidgetSnapshot.CalendarDay
  let isCompact: Bool

  var body: some View {
    Link(destination: WidgetURLs.day(date: day.date)) {
      CalendarCell(day: day, isCompact: isCompact)
    }
  }
}

// MARK: - Medium (current week only)

private struct MediumCalendarView: View {
  let snapshot: WidgetSnapshot

  var body: some View {
    let cal = snapshot.calendar
    let start = min(max(cal.currentWeekStart, 0), max(cal.days.count - 7, 0))
    let weekDays = Array(cal.days[start..<min(start + 7, cal.days.count)])

    VStack(alignment: .leading, spacing: WidgetSpacing.lg) {
      CalendarHeader(
        title: cal.monthTitle,
        createPlanLabel: snapshot.strings.createPlanLabel
      )
      // Header → grid gets extra breathing room, matching the in-app
      // Schedule card's spacing between title and the weekday row.
      VStack(spacing: WidgetSpacing.md) {
        WeekdayRow(labels: cal.weekdayLabels)
        HStack(spacing: cellGap) {
          ForEach(weekDays) { day in
            CellLink(day: day, isCompact: true)
          }
        }
        // Constrain the single-row height so a cell stays roughly square
        // instead of stretching to fill the whole widget vertically.
        .frame(height: 52)
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

// MARK: - Large (full month grid)

private struct LargeCalendarView: View {
  let snapshot: WidgetSnapshot

  var body: some View {
    let cal = snapshot.calendar
    // 6 rows of 7. The JS side guarantees 42 cells when unlocked.
    let rows = stride(from: 0, to: cal.days.count, by: 7).map {
      Array(cal.days[$0..<min($0 + 7, cal.days.count)])
    }

    VStack(alignment: .leading, spacing: WidgetSpacing.lg) {
      CalendarHeader(
        title: cal.monthTitle,
        createPlanLabel: snapshot.strings.createPlanLabel
      )
      // Extra gap between header and weekday row so the title doesn't feel
      // glued to the grid — mirrors the in-app Schedule card.
      VStack(spacing: WidgetSpacing.md) {
        WeekdayRow(labels: cal.weekdayLabels)
        VStack(spacing: cellGap) {
          ForEach(0..<rows.count, id: \.self) { rowIndex in
            HStack(spacing: cellGap) {
              ForEach(rows[rowIndex]) { day in
                CellLink(day: day, isCompact: false)
              }
            }
            .frame(maxHeight: .infinity)
          }
        }
        .frame(maxHeight: .infinity)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

// MARK: - Locked placeholder (publisher variant)

private struct LockedCalendarView: View {
  let snapshot: WidgetSnapshot

  var body: some View {
    VStack(spacing: WidgetSpacing.md) {
      Spacer()
      Image(systemName: "lock.fill")
        .font(.system(size: 28, weight: .semibold))
        .foregroundColor(.secondary)
      Text(snapshot.strings.calendarLabel)
        .font(.system(size: 13, weight: .bold))
        .foregroundColor(.primary)
      Text(snapshot.strings.calendarPublisherLockedLabel)
        .font(.system(size: 11))
        .foregroundColor(.secondary)
        .multilineTextAlignment(.center)
        .lineLimit(3)
        .minimumScaleFactor(0.8)
        .padding(.horizontal, WidgetSpacing.lg)
      Spacer()
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .widgetURL(WidgetURLs.home)
  }
}

// MARK: - Root view

private struct CalendarWidgetView: View {
  let entry: CalendarEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    Group {
      if let snapshot = entry.snapshot {
        if snapshot.calendar.locked {
          LockedCalendarView(snapshot: snapshot)
        } else {
          switch family {
          case .systemMedium:
            MediumCalendarView(snapshot: snapshot)
          default:
            LargeCalendarView(snapshot: snapshot)
          }
        }
      } else {
        placeholder
      }
    }
    .containerBackground(.background, for: .widget)
  }

  @ViewBuilder private var placeholder: some View {
    VStack {
      Spacer()
      Image(systemName: "calendar")
        .font(.system(size: 28))
        .foregroundColor(.secondary)
      Spacer()
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

// MARK: - Widget

struct CalendarWidget: Widget {
  let kind: String = "CalendarWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: CalendarProvider()) { entry in
      CalendarWidgetView(entry: entry)
    }
    .configurationDisplayName("Calendar")
    .description("Your month at a glance — hours, plans, and notes per day.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}
