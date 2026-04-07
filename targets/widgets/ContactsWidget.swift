import SwiftUI
import WidgetKit
import AppIntents

// MARK: - Timeline

private struct ContactsEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
  let configuration: ContactsConfigurationIntent
}

private struct ContactsProvider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> ContactsEntry {
    ContactsEntry(date: Date(), snapshot: nil, configuration: ContactsConfigurationIntent())
  }

  func snapshot(for configuration: ContactsConfigurationIntent, in context: Context) async -> ContactsEntry {
    ContactsEntry(date: Date(), snapshot: SnapshotLoader.load(), configuration: configuration)
  }

  func timeline(for configuration: ContactsConfigurationIntent, in context: Context) async -> Timeline<ContactsEntry> {
    let entry = ContactsEntry(
      date: Date(),
      snapshot: SnapshotLoader.load(),
      configuration: configuration
    )
    let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
    return Timeline(entries: [entry], policy: .after(next))
  }
}

// MARK: - Sorting (App Intent → snapshot)

private func sortContacts(
  _ contacts: [WidgetSnapshot.Contact],
  by option: ContactSortOption
) -> [WidgetSnapshot.Contact] {
  switch option {
  case .recent:
    // JS already sorted by `lastConversationAt` desc, so just return as-is.
    return contacts
  case .alphabetical:
    return contacts.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  case .bibleStudy:
    // Studies first, then everything else preserving recent order.
    return contacts.sorted { lhs, rhs in
      if lhs.isBibleStudy != rhs.isBibleStudy {
        return lhs.isBibleStudy && !rhs.isBibleStudy
      }
      return false
    }
  }
}

private func contactsCount(for family: WidgetFamily) -> Int {
  switch family {
  case .systemSmall:  return 1
  case .systemMedium: return 3
  case .systemLarge:  return 6
  default:            return 3
  }
}

// MARK: - Row

private struct ContactRow: View {
  let contact: WidgetSnapshot.Contact
  let strings: WidgetSnapshot.Strings
  let showQuickActions: Bool

  var body: some View {
    HStack(spacing: 8) {
      // Tap-name region opens Contact Details.
      Link(destination: WidgetURLs.contact(id: contact.id)) {
        HStack(spacing: 6) {
          if contact.isBibleStudy {
            Image(systemName: "book.closed.fill")
              .font(.caption2)
              .foregroundColor(.green)
          }
          Text(contact.name)
            .font(.caption)
            .fontWeight(.semibold)
            .lineLimit(1)
            .privacySensitive()
          Spacer(minLength: 0)
        }
      }

      if showQuickActions {
        HStack(spacing: 6) {
          if let telUrl = contact.telUrl, let url = URL(string: telUrl) {
            Link(destination: url) {
              Image(systemName: "phone.fill")
                .font(.caption2)
                .foregroundColor(.green)
            }
          }
          if let smsUrl = contact.smsUrl, let url = URL(string: smsUrl) {
            Link(destination: url) {
              Image(systemName: "message.fill")
                .font(.caption2)
                .foregroundColor(.green)
            }
          }
          if let mapsUrl = contact.mapsUrl, let url = URL(string: mapsUrl) {
            Link(destination: url) {
              Image(systemName: "location.fill")
                .font(.caption2)
                .foregroundColor(.green)
            }
          }
        }
      }
    }
  }
}

// MARK: - Root view

private struct ContactsWidgetView: View {
  let entry: ContactsEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    Group {
      if let snapshot = entry.snapshot {
        let visible = Array(
          sortContacts(snapshot.contacts, by: entry.configuration.sort)
            .prefix(contactsCount(for: family))
        )
        if visible.isEmpty {
          emptyState(strings: snapshot.strings)
        } else {
          VStack(alignment: .leading, spacing: 6) {
            HStack {
              Text(snapshot.strings.contactsLabel)
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundColor(.secondary)
              Spacer()
            }
            ForEach(visible) { contact in
              ContactRow(
                contact: contact,
                strings: snapshot.strings,
                showQuickActions: family != .systemSmall
              )
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
      Text(strings.noContactsLabel)
        .font(.caption)
        .foregroundColor(.secondary)
        .multilineTextAlignment(.center)
      Spacer()
    }
    .frame(maxWidth: .infinity)
  }
}

// MARK: - Widget

struct ContactsWidget: Widget {
  let kind: String = "ContactsWidget"

  var body: some WidgetConfiguration {
    AppIntentConfiguration(
      kind: kind,
      intent: ContactsConfigurationIntent.self,
      provider: ContactsProvider()
    ) { entry in
      ContactsWidgetView(entry: entry)
    }
    .configurationDisplayName("Contacts")
    .description("Quick access to your contacts with call / text / directions.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
