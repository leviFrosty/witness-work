import SwiftUI
import WidgetKit

struct UpNextEntry: TimelineEntry {
  let date: Date
  /// `nil` before the first snapshot.
  let snapshot: WatchSnapshot?
  /// Still to come at `date`, soonest first.
  let items: [UpNextItem]
  /// Raises Up Next in the Smart Stack in the hour before an item and while
  /// it's Now.
  let relevance: TimelineEntryRelevance?
}

/// One entry for each time what Up Next shows changes (`UpNext.changes`), so
/// it advances on its own between snapshots from the iPhone.
struct UpNextProvider: TimelineProvider {
  /// WidgetKit asks for a new timeline after the last entry.
  private static let maxEntries = 60

  func placeholder(in context: Context) -> UpNextEntry {
    UpNextEntry(date: .now, snapshot: nil, items: [], relevance: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (UpNextEntry) -> Void) {
    completion(entry(at: .now, snapshot: WatchStorage.loadContext()?.snapshot))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<UpNextEntry>) -> Void) {
    let now = Date.now
    let snapshot = WatchStorage.loadContext()?.snapshot
    let dates = [now] + UpNext.changes(snapshot, after: now).prefix(Self.maxEntries - 1)
    completion(
      Timeline(entries: dates.map { entry(at: $0, snapshot: snapshot) }, policy: .atEnd))
  }

  private func entry(at date: Date, snapshot: WatchSnapshot?) -> UpNextEntry {
    let items = UpNext.items(snapshot, at: date)
    let soon = items.first.map { UpNext.isSoon($0, at: date) } ?? false
    return UpNextEntry(
      date: date, snapshot: snapshot, items: items,
      relevance: TimelineEntryRelevance(score: soon ? 100 : 0))
  }
}

struct UpNextComplication: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "WitnessWorkUpNext", provider: UpNextProvider()) { entry in
      UpNextComplicationView(entry: entry)
        .containerBackground(.fill.tertiary, for: .widget)
        .widgetURL(entry.items.first.flatMap(UpNext.url(for:)))
    }
    .configurationDisplayName(L10n.t("watchUpNextComplicationName", nil))
    .description(L10n.t("watchUpNextComplicationDescription", nil))
    .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryRectangular, .accessoryInline])
  }
}

struct UpNextComplicationView: View {
  @Environment(\.widgetFamily) private var family
  /// Wrist down: the face may be seen by the person you're talking with.
  @Environment(\.isLuminanceReduced) private var hidesNames
  let entry: UpNextEntry

  var body: some View {
    let content = UpNextContent(entry: entry, hidesNames: hidesNames)
    switch family {
    case .accessoryCircular: UpNextCircularView(content: content)
    case .accessoryCorner: UpNextCornerView(content: content)
    case .accessoryInline: UpNextInlineView(content: content)
    default: UpNextRectangularView(content: content)
    }
  }
}

/// What each family draws from, with names hidden when needed.
private struct UpNextContent {
  let entry: UpNextEntry
  let hidesNames: Bool

  var snapshot: WatchSnapshot? { entry.snapshot }
  var isSetUp: Bool { entry.snapshot != nil }
  var item: UpNextItem? { entry.items.first }
  var then: UpNextItem? { entry.items.dropFirst().first }

  func title(_ item: UpNextItem) -> String {
    UpNext.title(item, hidesNames: hidesNames, snapshot)
  }

  func detail(_ item: UpNextItem) -> String? {
    UpNext.detail(item, hidesNames: hidesNames)
  }

  func heading(_ item: UpNextItem) -> String {
    UpNext.heading(item, at: entry.date, snapshot)
  }

  func shortWhen(_ item: UpNextItem) -> String {
    UpNext.shortWhen(item, at: entry.date, snapshot)
  }

  /// The time without its AM/PM marker, for a timed item later today.
  func clock(_ item: UpNextItem) -> String? {
    guard !UpNext.isNow(item, at: entry.date),
          UpNext.dayLabel(item, at: entry.date, snapshot) == nil
    else { return nil }
    return item.clockText
  }

  var nothingScheduled: String { L10n.t("watchNothingScheduled", snapshot) }
  var upNext: String { L10n.t("watchUpNext", snapshot) }
}

/// Laid out like Calendar's Today's Date: the symbol where its weekday is, in
/// the tint, and the time below in the same rounded type, sized to fit.
private struct UpNextCircularView: View {
  let content: UpNextContent

  var body: some View {
    ZStack {
      AccessoryWidgetBackground()
      CircularScaled { scale in
        if let item = content.item {
          VStack(spacing: 0) {
            Image(systemName: UpNext.symbol(item))
              .font(.system(size: 13 * scale, weight: .medium))
              .foregroundStyle(complicationTint)
              .widgetAccentable()
              .padding(.bottom, 2 * scale)
            if let clock = content.clock(item) {
              // `3:00` with a small `PM`, like the Alarms complication. One
              // Text, so it shrinks as a whole rather than truncating.
              let time = Text(clock)
                .font(.system(size: 18 * scale, weight: .medium, design: .rounded))
              if let period = item.periodText {
                let marker = Text(period)
                  .font(.system(size: 10 * scale, weight: .medium, design: .rounded))
                Text("\(time)\u{2009}\(marker)")
              } else {
                time
              }
            } else {
              Text(content.shortWhen(item))
                .font(.system(size: 17 * scale, weight: .medium, design: .rounded))
            }
          }
          .lineLimit(1)
          .minimumScaleFactor(0.6)
          .padding(.horizontal, 4 * scale)
        } else if content.isSetUp {
          Image(systemName: "calendar")
            .font(.system(size: 24 * scale, weight: .medium))
            .foregroundStyle(.secondary)
        } else {
          Text(verbatim: "—")
        }
      }
    }
    .accessibilityElement(children: .combine)
  }
}

/// Only when: a corner's curved label fits about a dozen characters, too few
/// for a name, and the symbol says whether it's a Follow-up or a Plan.
private struct UpNextCornerView: View {
  let content: UpNextContent

  var body: some View {
    if let item = content.item {
      Image(systemName: UpNext.symbol(item))
        .font(.title3)
        .widgetAccentable()
        .widgetLabel(content.shortWhen(item))
    } else if content.isSetUp {
      Image(systemName: "calendar")
        .font(.title3)
        .foregroundStyle(.secondary)
        .accessibilityLabel(content.nothingScheduled)
    } else {
      Text(verbatim: "—")
    }
  }
}

/// Like Calendar's: when, what, where. The Smart Stack and the large slots of
/// Modular faces also get the item after it.
private struct UpNextRectangularView: View {
  let content: UpNextContent

  var body: some View {
    Group {
      if let item = content.item {
        ViewThatFits(in: .vertical) {
          card(item, then: content.then, showsDetail: true)
          card(item, then: nil, showsDetail: true)
          card(item, then: nil, showsDetail: false)
        }
      } else {
        VStack(alignment: .leading, spacing: 2) {
          Text(content.upNext)
            .font(.headline)
            .widgetAccentable()
          if content.isSetUp {
            Text(content.nothingScheduled)
              .font(.footnote)
              .foregroundStyle(.secondary)
          } else {
            Text(verbatim: "—")
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  /// Caption for the lines after the first two: a 42mm Modular Duo slot fits
  /// the topic only that way.
  private func card(_ item: UpNextItem, then: UpNextItem?, showsDetail: Bool) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      // The symbol inline, so the line is no taller than its text.
      Text("\(Image(systemName: UpNext.symbol(item))) \(content.heading(item))")
        .font(.headline)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .widgetAccentable()
      Text(content.title(item))
        .font(.body.weight(.semibold))
        .lineLimit(1)
        .privacySensitive(item.kind == .followUp)
      if showsDetail, let detail = content.detail(item) {
        Text(detail)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
          .privacySensitive(item.kind == .followUp)
      }
      if let then {
        Text(verbatim: "\(L10n.t("watchThen", content.snapshot)) · \(content.shortWhen(then)) · \(content.title(then))")
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
          .privacySensitive(then.kind == .followUp)
      }
    }
    .accessibilityElement(children: .combine)
  }
}

private struct UpNextInlineView: View {
  let content: UpNextContent

  var body: some View {
    if let item = content.item {
      Label {
        Text(verbatim: "\(content.shortWhen(item)) · \(content.title(item))")
          .privacySensitive(item.kind == .followUp)
      } icon: {
        Image(systemName: UpNext.symbol(item))
      }
    } else if content.isSetUp {
      Text(content.nothingScheduled)
    } else {
      Text(verbatim: "—")
    }
  }
}
