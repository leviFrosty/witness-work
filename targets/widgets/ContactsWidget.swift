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
//
// Counts chosen so two-line rows (name + relative date) never overflow the
// widget height on medium/large. Previous 4/8 packed rows tight enough that
// the header was being clipped against the top safe-area.

private func contactsCount(for family: WidgetFamily) -> Int {
  switch family {
  case .systemSmall:  return 5
  case .systemMedium: return 3
  case .systemLarge:  return 6
  default:            return 3
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
  @Environment(\.widgetAccent) private var accent

  var body: some View {
    let qa = showAction ? quickAction(for: contact, action: action) : nil

    HStack(spacing: WidgetSpacing.md) {
      // Tappable name region — opens Contact Details.
      Link(destination: WidgetURLs.contact(id: contact.id)) {
        HStack(spacing: WidgetSpacing.md) {
          // Staleness dot — functional color indicator of "how long ago".
          Circle()
            .fill(contact.staleness.color(accent: accent))
            .frame(width: 8, height: 8)

          VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
              Text(contact.name)
                .font(.system(size: isCompact ? 13 : 14, weight: .semibold))
                .foregroundColor(.primary)
                .lineLimit(1)
                .privacySensitive()
              if contact.isFavorite {
                Image(systemName: "star.fill")
                  .font(.system(size: 9))
                  .foregroundStyle(WidgetColor.warn)
              }
              if contact.isBibleStudy {
                Image(systemName: "book.closed.fill")
                  .font(.system(size: 9))
                  .foregroundStyle(accent)
              }
            }
            // Last-contacted relative date — only on medium/large where there
            // is room for two lines per row without crowding.
            if !isCompact, let when = contact.lastContactedRelative {
              Text(when)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
          }

          Spacer(minLength: 0)
        }
      }

      if let qa = qa {
        Link(destination: qa.url) {
          Image(systemName: qa.icon)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(accent)
            .frame(width: 28, height: 28)
            .background(Circle().fill(accent.opacity(0.15)))
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
    .environment(\.widgetAccent, entry.snapshot?.resolvedAccent ?? WidgetColor.brandAccent)
    .containerBackground(.background, for: .widget)
  }

  private func content(
    snapshot: WidgetSnapshot,
    visible: [WidgetSnapshot.Contact]
  ) -> some View {
    let isSmall = family == .systemSmall
    // Rows breathe more on medium/large where each row is two-line; small
    // stays tight since rows are single-line and a roomier gap would waste
    // the limited 158pt canvas.
    let rowSpacing: CGFloat = isSmall ? WidgetSpacing.md : WidgetSpacing.xl
    return VStack(alignment: .leading, spacing: WidgetSpacing.lg) {
      // Header — tracking + caption2 matches the styling used in the Report
      // widget so the system-caps labels across widgets feel intentional.
      Text(snapshot.strings.contactsLabel.uppercased())
        .font(.caption2)
        .fontWeight(.semibold)
        .tracking(0.5)
        .foregroundStyle(.secondary)
        .lineLimit(1)

      // Dividers removed — whitespace carries the row rhythm (Apple pattern
      // used in Reminders/Mail widgets) and reclaims ~3pt × (N-1) vertical
      // budget, which was exactly what was pushing the header into the clip.
      VStack(spacing: rowSpacing) {
        ForEach(visible) { contact in
          ContactRow(
            contact: contact,
            action: snapshot.config.contactAction,
            showAction: !isSmall,
            isCompact: isSmall
          )
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
