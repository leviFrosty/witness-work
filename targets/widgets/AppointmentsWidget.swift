import SwiftUI
import WidgetKit

// MARK: - Timeline
//
// Time window lives in `WidgetSnapshot.config.appointmentWindow`, sourced from
// in-app Settings > Widgets. JS pre-trims to the widest possible window (30d
// back through 31d forward) and pre-formats the time-of-day string for the
// current locale; Swift just narrows by the configured forward edge and
// renders.

private struct AppointmentsEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
}

private struct AppointmentsProvider: TimelineProvider {
  func placeholder(in context: Context) -> AppointmentsEntry {
    AppointmentsEntry(date: Date(), snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (AppointmentsEntry) -> Void) {
    completion(AppointmentsEntry(date: Date(), snapshot: SnapshotLoader.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<AppointmentsEntry>) -> Void) {
    let entry = AppointmentsEntry(date: Date(), snapshot: SnapshotLoader.load())
    let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

// MARK: - Filtering

private extension WidgetSnapshot.AppointmentWindow {
  /// Forward-looking days for this window. Overdue items always pass through
  /// regardless because they remain actionable until the user reschedules.
  var forwardDays: Int {
    switch self {
    case .today:        return 1
    case .sevenDays:    return 7
    case .fourteenDays: return 14
    case .thirtyDays:   return 30
    }
  }
}

private func filterAppointments(
  _ appointments: [WidgetSnapshot.Appointment],
  window: WidgetSnapshot.AppointmentWindow,
  now: Date
) -> [WidgetSnapshot.Appointment] {
  let cal = Calendar.current
  let max = cal.date(byAdding: .day, value: window.forwardDays, to: now) ?? now
  return appointments.filter { appt in
    appt.isOverdue || appt.dateAsDate <= max
  }
}

private func appointmentsCount(for family: WidgetFamily) -> Int {
  switch family {
  case .systemMedium: return 3
  case .systemLarge:  return 7
  default:            return 3
  }
}

/// Header reads "Today's Conversations" when at least one visible appointment
/// falls on the current day, "Upcoming Conversations" otherwise. Pre-translated
/// strings come from the snapshot.
private func headerLabel(
  visible: [WidgetSnapshot.Appointment],
  strings: WidgetSnapshot.Strings,
  now: Date
) -> String {
  let cal = Calendar.current
  let hasToday = visible.contains { cal.isDate($0.dateAsDate, inSameDayAs: now) }
  return hasToday ? strings.todaysConversationsLabel : strings.upcomingConversationsLabel
}

// MARK: - Row

private struct AppointmentRow: View {
  let appointment: WidgetSnapshot.Appointment
  let strings: WidgetSnapshot.Strings

  var body: some View {
    // Overdue follow-ups deep-link to the Reschedule sheet — the user almost
    // certainly wants to reschedule or mark complete, not browse history.
    let destination = appointment.isOverdue
      ? WidgetURLs.reschedule(
          contactId: appointment.contactId,
          conversationId: appointment.id
        )
      : WidgetURLs.conversation(
          contactId: appointment.contactId,
          conversationId: appointment.id
        )

    Link(destination: destination) {
      HStack(spacing: WidgetSpacing.lg) {
        VStack(alignment: .leading, spacing: WidgetSpacing.xs) {
          HStack(spacing: WidgetSpacing.xs) {
            Text(appointment.contactName)
              .font(.system(size: 13, weight: .semibold))
              .foregroundColor(.primary)
              .lineLimit(1)
              .privacySensitive()
            if appointment.isOverdue {
              Text(strings.overdueLabel.uppercased())
                .font(.system(size: 8, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 5)
                .padding(.vertical, 1)
                .background(
                  Capsule().fill(WidgetColor.error)
                )
            }
          }
          // Topic only when present — no reserved blank row otherwise.
          if let topic = appointment.topic, !topic.isEmpty {
            Text(topic)
              .font(.system(size: 10))
              .foregroundColor(.secondary)
              .lineLimit(1)
              .privacySensitive()
          }
        }
        Spacer(minLength: 0)
        Text(appointment.timeFormatted)
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(appointment.isOverdue ? WidgetColor.error : WidgetColor.accent)
          .lineLimit(1)
      }
    }
  }
}

// MARK: - Root view

private struct AppointmentsWidgetView: View {
  let entry: AppointmentsEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    Group {
      if let snapshot = entry.snapshot {
        let visible = Array(
          filterAppointments(
            snapshot.appointments,
            window: snapshot.config.appointmentWindow,
            now: entry.date
          )
          .prefix(appointmentsCount(for: family))
        )
        if visible.isEmpty {
          emptyState(strings: snapshot.strings)
        } else {
          content(snapshot: snapshot, visible: visible)
        }
      } else {
        VStack {
          Spacer()
          Text("—")
            .font(.system(size: 20, weight: .bold))
            .foregroundColor(.secondary)
          Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .containerBackground(.background, for: .widget)
  }

  private func content(
    snapshot: WidgetSnapshot,
    visible: [WidgetSnapshot.Appointment]
  ) -> some View {
    VStack(alignment: .leading, spacing: WidgetSpacing.md) {
      Text(headerLabel(visible: visible, strings: snapshot.strings, now: entry.date)
            .uppercased())
        .font(.system(size: 9, weight: .bold))
        .foregroundColor(.secondary)
        .lineLimit(1)

      VStack(spacing: WidgetSpacing.md) {
        ForEach(Array(visible.enumerated()), id: \.element.id) { index, appt in
          AppointmentRow(appointment: appt, strings: snapshot.strings)
          if index < visible.count - 1 {
            Divider().opacity(0.4)
          }
        }
        Spacer(minLength: 0)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  private func emptyState(strings: WidgetSnapshot.Strings) -> some View {
    VStack {
      Spacer()
      Text(strings.noAppointmentsLabel)
        .font(.caption)
        .foregroundColor(.secondary)
        .multilineTextAlignment(.center)
      Spacer()
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

// MARK: - Widget

struct AppointmentsWidget: Widget {
  let kind: String = "AppointmentsWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: AppointmentsProvider()) { entry in
      AppointmentsWidgetView(entry: entry)
    }
    .configurationDisplayName("Appointments")
    .description("Upcoming follow-ups. Overdue items surface a reschedule sheet on tap.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}
