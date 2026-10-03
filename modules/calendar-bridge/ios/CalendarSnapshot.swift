import Foundation

struct CalendarEntry: Codable {
  var key: String
  var title: String
  var start: Double
  var end: Double
  var url: String
  var location: String

  var validDates: Bool {
    let duration = end - start
    return start.isFinite && end.isFinite && start >= 0 && end < 4102444800000 &&
      duration >= 5 * 60_000 && duration <= 480 * 60_000 &&
      duration.truncatingRemainder(dividingBy: 60_000) == 0
  }
}

struct CalendarSnapshot: Codable {
  var title: String
  var entries: [CalendarEntry]
  var removed: [String]
  var deletedContactIds: [String]

  /// Missing future events from another device can still be downloading. Past,
  /// explicitly removed appointments don't block reconciliation. Locally seen
  /// keys still pause: a missing event might have moved and changed identifier.
  func missingKeys(published: [String], existing: Set<String>, now: Double) -> Set<String> {
    let past = entries.filter { $0.validDates && $0.start < now }.map(\.key)
    return Set(published).subtracting(existing).subtracting(removed).subtracting(past)
  }

  /// Read contact identity from our own marker even when its Visit is absent
  /// from a partial app-data snapshot. Split before decoding escaped slashes.
  static func contactId(from url: URL?) -> String? {
    guard let url = url, let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
          parts.scheme == "witnesswork", parts.host == "contact" else { return nil }
    return parts.percentEncodedPath.split(separator: "/").first?.removingPercentEncoding
  }
}
