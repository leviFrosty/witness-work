import WidgetKit
import SwiftUI

// MARK: - Snapshot model
//
// Mirror of `WidgetSnapshot` defined in `src/lib/widgets/snapshot.ts`. Bump
// `SUPPORTED_VERSION` whenever the JS schema's `version` field changes in a
// way Swift cares about.

private let SUPPORTED_VERSION = 1

private struct WidgetSnapshot: Decodable {
  struct Strings: Decodable {
    let monthHoursLabel: String
    let goalLabel: String
  }
  struct Hours: Decodable {
    let monthMinutes: Int
    let monthHoursFormatted: String
    let goalHours: Int
    let progress: Double
  }

  let version: Int
  let updatedAt: Double
  let locale: String
  let strings: Strings
  let hours: Hours
}

// MARK: - Snapshot loading

private enum SnapshotLoader {
  /// Resolve the App Group identifier from the host app bundle id. Matches the
  /// logic in `WidgetBridgeModule.swift` so the widget reads from the same
  /// container the JS side wrote to.
  static var appGroupIdentifier: String? {
    // Widget bundle ids look like "<host>.HoursStubWidget"; strip the suffix.
    guard let widgetBundle = Bundle.main.bundleIdentifier else { return nil }
    let host: String
    if let dot = widgetBundle.lastIndex(of: ".") {
      host = String(widgetBundle[..<dot])
    } else {
      host = widgetBundle
    }
    return "group.\(host)"
  }

  static func load() -> WidgetSnapshot? {
    guard let group = appGroupIdentifier,
          let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: group
          )
    else { return nil }

    let url = container.appendingPathComponent("snapshot.json")
    guard let data = try? Data(contentsOf: url),
          let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
          snapshot.version == SUPPORTED_VERSION
    else { return nil }
    return snapshot
  }
}

// MARK: - Timeline

private struct HoursEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
}

private struct HoursProvider: TimelineProvider {
  func placeholder(in context: Context) -> HoursEntry {
    HoursEntry(date: Date(), snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (HoursEntry) -> Void) {
    completion(HoursEntry(date: Date(), snapshot: SnapshotLoader.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<HoursEntry>) -> Void) {
    let entry = HoursEntry(date: Date(), snapshot: SnapshotLoader.load())
    // Re-check hourly even if the app never reloads us — covers the case
    // where the user never opens the app and background fetch doesn't fire.
    let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

// MARK: - View

private struct HoursWidgetView: View {
  let entry: HoursEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      if let s = entry.snapshot {
        Text(s.strings.monthHoursLabel)
          .font(.caption)
          .foregroundColor(.secondary)
        Text(s.hours.monthHoursFormatted)
          .font(.system(size: 32, weight: .bold))
        Text("/\(s.hours.goalHours) \(s.strings.goalLabel)")
          .font(.caption2)
          .foregroundColor(.secondary)
      } else {
        Text("—")
          .font(.system(size: 32, weight: .bold))
      }
    }
    .padding()
    .containerBackground(.background, for: .widget)
  }
}

// MARK: - Widget

@main
struct HoursStubWidget: Widget {
  let kind: String = "HoursStubWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: HoursProvider()) { entry in
      HoursWidgetView(entry: entry)
    }
    .configurationDisplayName("Hours")
    .description("Current month's hours toward your goal.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
