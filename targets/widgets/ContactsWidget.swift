import SwiftUI
import WidgetKit

// MARK: - Timeline
//
// Sort + per-row quick action live in `WidgetSnapshot.config`, sourced from
// in-app Settings > Widgets. Swift never re-sorts contacts; JS sends them in
// the user's chosen order with favorites and bible studies tiered to the top.

private struct ContactsEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
}

private struct ContactsProvider: TimelineProvider {
  func placeholder(in context: Context) -> ContactsEntry {
    ContactsEntry(date: Date(), snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (ContactsEntry) -> Void) {
    completion(ContactsEntry(date: Date(), snapshot: SnapshotLoader.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<ContactsEntry>) -> Void) {
    let entry = ContactsEntry(date: Date(), snapshot: SnapshotLoader.load())
    let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

// MARK: - Family sizing
//
// Small drops the action icon entirely (one tappable region: the contact),
// medium and large reserve the right edge for the configured action.

private func contactsCount(for family: WidgetFamily) -> Int {
  switch family {
  case .systemSmall:  return 1
  case .systemMedium: return 4
  case .systemLarge:  return 8
  default:            return 4
  }
}

// MARK: - Quick action

/// Returns the SF Symbol + URL for the user's chosen quick action, or `nil`
/// when the action either isn't configured (`.none`) or the contact lacks the
/// required data (e.g. no phone number for `.call`/`.text`).
private func quickAction(
  for contact: WidgetSnapshot.Contact,
  action: WidgetSnapshot.ContactAction
) -> (icon: String, url: URL)? {
  switch action {
  case .none:
    return nil
  case .directions:
    if let str = contact.mapsUrl, let url = URL(string: str) {
      return ("location.fill", url)
    }
  case .call:
    if let str = contact.telUrl, let url = URL(string: str) {
      return ("phone.fill", url)
    }
  case .text:
    if let str = contact.smsUrl, let url = URL(string: str) {
      return ("message.fill", url)
    }
  }
  return nil
}

// MARK: - Row

private struct ContactRow: View {
  let contact: WidgetSnapshot.Contact
  let action: WidgetSnapshot.ContactAction
  let showAction: Bool
  let isCompact: Bool

  var body: some View {
    let qa = showAction ? quickAction(for: contact, action: action) : nil

    HStack(spacing: WidgetSpacing.lg) {
      // Tappable name region — opens Contact Details.
      Link(destination: WidgetURLs.contact(id: contact.id)) {
        HStack(spacing: WidgetSpacing.md) {
          // Staleness dot
          Circle()
            .fill(contact.staleness.color)
            .frame(width: 7, height: 7)

          VStack(alignment: .leading, spacing: WidgetSpacing.xs) {
            HStack(spacing: WidgetSpacing.xs) {
              Text(contact.name)
                .font(.system(size: isCompact ? 12 : 13, weight: .semibold))
                .foregroundColor(.primary)
                .lineLimit(1)
                .privacySensitive()
              if contact.isFavorite {
                Image(systemName: "star.fill")
                  .font(.system(size: 8))
                  .foregroundColor(WidgetColor.warn)
              }
              if contact.isBibleStudy {
                Image(systemName: "book.closed.fill")
                  .font(.system(size: 8))
                  .foregroundColor(WidgetColor.accent)
              }
            }
            // Last-contacted relative date — only on medium/large where there
            // is room for two lines per row without crowding.
            if !isCompact, let when = contact.lastContactedRelative {
              Text(when)
                .font(.system(size: 10))
                .foregroundColor(.secondary)
                .lineLimit(1)
            }
          }

          Spacer(minLength: 0)
        }
      }

      if let qa = qa {
        Link(destination: qa.url) {
          Image(systemName: qa.icon)
            .font(.system(size: 13, weight: .semibold))
            .foregroundColor(WidgetColor.accent)
            .frame(width: 24, height: 24)
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
        let visible = Array(snapshot.contacts.prefix(contactsCount(for: family)))
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
    visible: [WidgetSnapshot.Contact]
  ) -> some View {
    let isSmall = family == .systemSmall
    return VStack(alignment: .leading, spacing: WidgetSpacing.md) {
      // Header
      Text(snapshot.strings.contactsLabel.uppercased())
        .font(.system(size: 9, weight: .bold))
        .foregroundColor(.secondary)
        .lineLimit(1)

      // Rows distributed evenly across the available height.
      VStack(spacing: WidgetSpacing.md) {
        ForEach(Array(visible.enumerated()), id: \.element.id) { index, contact in
          ContactRow(
            contact: contact,
            action: snapshot.config.contactAction,
            showAction: !isSmall,
            isCompact: isSmall
          )
          if index < visible.count - 1 && !isSmall {
            Divider()
              .opacity(0.4)
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
      Text(strings.noContactsLabel)
        .font(.caption)
        .foregroundColor(.secondary)
        .multilineTextAlignment(.center)
      Spacer()
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

// MARK: - Widget

struct ContactsWidget: Widget {
  let kind: String = "ContactsWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: ContactsProvider()) { entry in
      ContactsWidgetView(entry: entry)
    }
    .configurationDisplayName("Contacts")
    .description("Quick access to your contacts. Sort, action, and favorites set in Settings.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
