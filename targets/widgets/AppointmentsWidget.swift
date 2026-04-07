import SwiftUI
import WidgetKit
import AppIntents

// MARK: - Timeline

private struct AppointmentsEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
  let configuration: AppointmentsConfigurationIntent
}

private struct AppointmentsProvider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> AppointmentsEntry {
    AppointmentsEntry(
      date: Date(),
      snapshot: nil,
      configuration: AppointmentsConfigurationIntent()
    )
  }

  func snapshot(for configuration: AppointmentsConfigurationIntent, in context: Context) async -> AppointmentsEntry {
    AppointmentsEntry(
      date: Date(),
      snapshot: SnapshotLoader.load(),
      configuration: configuration
    )
  }

  func timeline(for configuration: AppointmentsConfigurationIntent, in context: Context) async -> Timeline<AppointmentsEntry> {
    let entry = AppointmentsEntry(
      date: Date(),
      snapshot: SnapshotLoader.load(),
      configuration: configuration
    )
    let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
    return Timeline(entries: [entry], policy: .after(next))
  }
}

// MARK: - Filtering

private func filterAppointments(
  _ appointments: [WidgetSnapshot.Appointment],
  window: AppointmentWindow,
  now: Date
) -> [WidgetSnapshot.Appointment] {
  let max = Calendar.current.date(byAdding: .day, value: window.days, to: now) ?? now
  // The JS side already trims to "now − 4h" .. "now + 31d" and sorts ascending.
  return appointments.filter { $0.dateAsDate <= max }
}

private func appointmentsCount(for family: WidgetFamily) -> Int {
  switch family {
  case .systemMedium: return 3
  case .systemLarge:  return 7
  default:            return 3
  }
}

/// Mirrors `ApproachingConversations.tsx`: before 4:59 PM, the heading reads
/// "Today's Conversations"; after, "Upcoming Conversations". Pre-translated
/// strings come from the snapshot.
private func headerLabel(strings: WidgetSnapshot.Strings, now: Date) -> String {
  var components = Calendar.current.dateComponents([.hour], from: now)
  let hour = components.hour ?? 0
  return hour < 17 ? strings.todaysConversationsLabel : strings.upcomingConversationsLabel
}

// MARK: - Row

private struct AppointmentRow: View {
  let appointment: WidgetSnapshot.Appointment
  let strings: WidgetSnapshot.Strings

  var body: some View {
    Link(
      destination: WidgetURLs.conversation(
        contactId: appointment.contactId,
        conversationId: appointment.id
      )
    ) {
      HStack(spacing: 8) {
        VStack(alignment: .leading, spacing: 1) {
          HStack(spacing: 4) {
            if appointment.isBibleStudy {
              Image(systemName: "book.closed.fill")
                .font(.caption2)
                .foregroundColor(.green)
            }
            Text(appointment.contactName)
              .font(.caption)
              .fontWeight(.semibold)
              .lineLimit(1)
              .privacySensitive()
          }
          if let topic = appointment.topic, !topic.isEmpty {
            Text(topic)
              .font(.caption2)
              .foregroundColor(.secondary)
              .lineLimit(1)
              .privacySensitive()
          }
        }
        Spacer(minLength: 0)
        Text(formatRelative(date: appointment.dateAsDate, strings: strings))
          .font(.caption2)
          .fontWeight(.semibold)
          .foregroundColor(.green)
      }
    }
  }

  private func formatRelative(date: Date, strings: WidgetSnapshot.Strings) -> String {
    let cal = Calendar.current
    let now = Date()
    if cal.isDateInToday(date) {
      let f = DateFormatter()
      f.timeStyle = .short
      f.dateStyle = .none
      return "\(strings.todayLabel) \(f.string(from: date))"
    }
    if cal.isDateInTomorrow(date) {
      return strings.tomorrowLabel
    }
    let days = cal.dateComponents([.day], from: cal.startOfDay(for: now), to: cal.startOfDay(for: date)).day ?? 0
    if days < 7 {
      let f = DateFormatter()
      f.dateFormat = "EEE"
      return f.string(from: date)
    }
    let f = DateFormatter()
    f.dateFormat = "MMM d"
    return f.string(from: date)
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
            window: entry.configuration.window,
            now: entry.date
          )
          .prefix(appointmentsCount(for: family))
        )
        if visible.isEmpty {
          emptyState(strings: snapshot.strings)
        } else {
          VStack(alignment: .leading, spacing: 6) {
            HStack {
              Text(headerLabel(strings: snapshot.strings, now: entry.date))
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundColor(.secondary)
                .lineLimit(1)
              Spacer()
            }
            ForEach(visible) { appointment in
              AppointmentRow(appointment: appointment, strings: snapshot.strings)
            }
            Spacer(minLength: 0)
          }
        }
      } else {
        Text("—")
          .font(.system(size: 20, weight: .bold))
          .foregroundColor(.secondary)
      }
    }
    .padding()
    .containerBackground(.background, for: .widget)
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
    .frame(maxWidth: .infinity)
  }
}

// MARK: - Widget

struct AppointmentsWidget: Widget {
  let kind: String = "AppointmentsWidget"

  var body: some WidgetConfiguration {
    AppIntentConfiguration(
      kind: kind,
      intent: AppointmentsConfigurationIntent.self,
      provider: AppointmentsProvider()
    ) { entry in
      AppointmentsWidgetView(entry: entry)
    }
    .configurationDisplayName("Appointments")
    .description("Upcoming follow-ups from your conversations.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}
