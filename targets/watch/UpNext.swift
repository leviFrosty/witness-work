import Foundation

// Canonical here and copied into `targets/watch-widgets/Shared` by
// `scripts/sync-widget-shared.mjs`, so the app and complications agree.

/// What Up Next shows at a given time: the soonest Follow-up or Plan that
/// hasn't started, or one that started within `nowWindow` so its place and
/// topic are there on arrival. A Plan without a time spans its day, after that
/// day's timed items. The iPhone sends the next two weeks in order
/// (`src/app/watch/buildUpNext.ts`); the watch only drops what has passed, so it
/// stays right without the iPhone.
enum UpNext {
  /// Mirrors `NOW_WINDOW_MINUTES` in `buildUpNext.ts`.
  static let nowWindow: TimeInterval = 15 * 60
  /// How early the Smart Stack may raise Up Next before an item.
  static let soonWindow: TimeInterval = 60 * 60

  /// Items still to show at `date`, soonest first.
  static func items(_ snapshot: WatchSnapshot?, at date: Date) -> [UpNextItem] {
    (snapshot?.upNext ?? []).filter { shownUntil($0) > date }
  }

  static func item(id: String, in snapshot: WatchSnapshot?) -> UpNextItem? {
    snapshot?.upNext?.first { $0.id == id }
  }

  static func shownUntil(_ item: UpNextItem) -> Date {
    guard !item.timed else { return item.startDate.addingTimeInterval(nowWindow) }
    let calendar = Calendar.current
    let day = calendar.startOfDay(for: item.startDate)
    return calendar.date(byAdding: .day, value: 1, to: day) ?? item.startDate
  }

  static func isNow(_ item: UpNextItem, at date: Date) -> Bool {
    item.timed && item.startDate <= date
  }

  /// Within the hour before a timed item, or during its Now window.
  static func isSoon(_ item: UpNextItem, at date: Date) -> Bool {
    item.timed && item.startDate.timeIntervalSince(date) <= soonWindow
  }

  /// Times after `date` when what Up Next shows changes: an item becoming
  /// soon, starting, or leaving, and each midnight, when day labels change.
  static func changes(_ snapshot: WatchSnapshot?, after date: Date) -> [Date] {
    var dates: [Date] = []
    for item in snapshot?.upNext ?? [] where item.timed {
      dates += [
        item.startDate.addingTimeInterval(-soonWindow), item.startDate, shownUntil(item),
      ]
    }
    let calendar = Calendar.current
    var midnight = calendar.startOfDay(for: date)
    for _ in 0..<7 {
      guard let next = calendar.date(byAdding: .day, value: 1, to: midnight) else { break }
      midnight = next
      dates.append(midnight)
    }
    return Array(Set(dates.filter { $0 > date })).sorted()
  }

  // MARK: Labels

  /// `nil` today; otherwise `Tomorrow`, a weekday this week, or a date.
  static func dayLabel(_ item: UpNextItem, at date: Date, _ snapshot: WatchSnapshot?) -> String? {
    let calendar = Calendar.current
    let days = calendar.dateComponents(
      [.day], from: calendar.startOfDay(for: date),
      to: calendar.startOfDay(for: item.startDate)
    ).day ?? 0
    switch days {
    case ...0: return nil
    case 1: return L10n.t("tomorrow", snapshot)
    case 2...6: return item.weekdayText
    default: return item.dateText
    }
  }

  /// E.g. `3:00 PM`, `Tomorrow · 3:00 PM`, `Today` or `Thu`.
  static func when(_ item: UpNextItem, at date: Date, _ snapshot: WatchSnapshot?) -> String {
    switch (dayLabel(item, at: date, snapshot), item.timeText) {
    case let (day?, time?): "\(day) · \(time)"
    case let (day?, nil): day
    case let (nil, time?): time
    case (nil, nil): L10n.t("today", snapshot)
    }
  }

  /// `Now · 3:00 PM` once it has started, otherwise `when`.
  static func heading(_ item: UpNextItem, at date: Date, _ snapshot: WatchSnapshot?) -> String {
    let when = when(item, at: date, snapshot)
    return isNow(item, at: date) ? "\(L10n.t("watchNow", snapshot)) · \(when)" : when
  }

  /// The time today, otherwise the day; for tight spots.
  static func shortWhen(_ item: UpNextItem, at date: Date, _ snapshot: WatchSnapshot?) -> String {
    if isNow(item, at: date) { return L10n.t("watchNow", snapshot) }
    return dayLabel(item, at: date, snapshot) ?? item.timeText ?? L10n.t("today", snapshot)
  }

  /// The title, except a Contact's name while `hidesNames`: a dimmed watch
  /// face is visible to the person you're talking with.
  static func title(_ item: UpNextItem, hidesNames: Bool, _ snapshot: WatchSnapshot?) -> String {
    item.kind == .followUp && hidesNames ? L10n.t("followUp", snapshot) : item.title
  }

  /// Topic or street for a Follow-up (hidden with names); duration and place
  /// for a Plan.
  static func detail(_ item: UpNextItem, hidesNames: Bool) -> String? {
    switch item.kind {
    case .followUp:
      return hidesNames ? nil : item.detail
    case .plan:
      let parts = [item.durationText, item.detail].compactMap { $0 }.filter { !$0.isEmpty }
      return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
  }

  static func symbol(_ item: UpNextItem) -> String {
    item.kind == .followUp ? "person.fill" : "calendar"
  }

  // MARK: Links

  /// Opens the item in the watch app, from a complication.
  static func url(for item: UpNextItem) -> URL? {
    var components = URLComponents()
    components.scheme = "witnesswork-watch"
    components.host = "up-next"
    components.queryItems = [URLQueryItem(name: "id", value: item.id)]
    return components.url
  }

  static func itemId(from url: URL) -> String? {
    guard url.scheme == "witnesswork-watch", url.host == "up-next" else { return nil }
    return URLComponents(url: url, resolvingAgainstBaseURL: false)?
      .queryItems?.first { $0.name == "id" }?.value
  }
}
