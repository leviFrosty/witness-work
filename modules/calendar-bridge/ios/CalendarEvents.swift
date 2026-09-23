import EventKit
import Foundation
import UIKit

struct CalendarEntry: Codable {
  var key: String
  var title: String
  var start: Double
  var end: Double
  var url: String
  var location: String
}

struct CalendarSnapshot: Codable {
  var entries: [CalendarEntry]
  var removed: [String]
}

/// Used exclusively on the native module's serial queue, while holding the
/// cloud publishing lock for every mutation (including calendar creation).
final class CalendarEvents {
  private let store = EKEventStore()

  func requestAccess(_ completion: @escaping (Bool, Error?) -> Void) {
    if #available(iOS 17.0, *) {
      store.requestFullAccessToEvents(completion: completion)
    } else {
      store.requestAccess(to: .event, completion: completion)
    }
  }

  private func requireAccess() throws {
    let status = EKEventStore.authorizationStatus(for: .event)
    if #available(iOS 17.0, *) {
      guard status == .fullAccess else { throw CalendarFailure("CALENDAR_PERMISSION") }
    } else {
      guard status == .authorized else { throw CalendarFailure("CALENDAR_PERMISSION") }
    }
    store.reset()
  }

  /// "On My iPhone" calendars are excluded: another primary device could
  /// never see or clean up their events.
  func destinations() throws -> [[String: String]] {
    try requireAccess()
    return store.calendars(for: .event).filter {
      $0.allowsContentModifications && $0.source.sourceType != .local &&
        $0.calendarIdentifier != store.defaultCalendarForNewEvents?.calendarIdentifier
    }.map(describe)
  }

  func sources() throws -> [[String: String]] {
    try requireAccess()
    return store.sources.filter { $0.sourceType == .calDAV }
      .map { ["id": $0.sourceIdentifier, "title": $0.title] }
  }

  private func describe(_ calendar: EKCalendar) -> [String: String] {
    ["id": calendar.calendarIdentifier, "title": calendar.title, "account": calendar.source.title]
  }

  func create(sourceId: String, title: String, namespace: String) throws -> [String: String] {
    try requireAccess()
    let recoveryKey = "calendar-created-\(namespace)"
    if let id = UserDefaults.standard.string(forKey: recoveryKey),
       let existing = store.calendar(withIdentifier: id) {
      guard existing.source.sourceIdentifier == sourceId else { throw CalendarFailure("CALENDAR_CHOOSE_EXISTING") }
      return describe(existing)
    }
    guard let source = store.sources.first(where: { $0.sourceIdentifier == sourceId }) else {
      throw CalendarFailure("CALENDAR_MISSING")
    }
    // A save may have succeeded before its local recovery ID was recorded.
    // Never create a second calendar or adopt one just because titles match.
    guard !store.calendars(for: .event).contains(where: { $0.title == title && $0.source.sourceIdentifier == sourceId }) else {
      throw CalendarFailure("CALENDAR_CHOOSE_EXISTING")
    }
    let calendar = EKCalendar(for: .event, eventStore: store)
    calendar.title = title
    calendar.source = source
    calendar.cgColor = UIColor.systemTeal.cgColor
    try store.saveCalendar(calendar, commit: true)
    UserDefaults.standard.set(calendar.calendarIdentifier, forKey: recoveryKey)
    return describe(calendar)
  }

  private func destination(_ id: String) throws -> EKCalendar {
    guard let calendar = store.calendar(withIdentifier: id), calendar.allowsContentModifications else {
      throw CalendarFailure("CALENDAR_MISSING")
    }
    return calendar
  }

  private func marker(_ event: EKEvent, namespace: String) -> String? {
    guard let url = event.url,
          let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
          parts.scheme == "witnesswork", parts.host == "contact",
          parts.queryItems?.first(where: { $0.name == "calendar" })?.value == namespace else { return nil }
    return parts.queryItems?.first(where: { $0.name == "followUp" })?.value
  }

  /// Keyed per calendar: switching calendars on this device must not treat
  /// events kept in the previous calendar as moved.
  private func cacheKey(_ calendar: EKCalendar, _ state: CalendarPublishingState) -> String {
    "calendar-events-\(state.namespace)-\(calendar.calendarIdentifier)"
  }

  /// Follow-up key → event identifiers this device committed to the calendar.
  private func cached(_ calendar: EKCalendar, _ state: CalendarPublishingState) -> [String: [String]] {
    UserDefaults.standard.dictionary(forKey: cacheKey(calendar, state)) as? [String: [String]] ?? [:]
  }

  private func ownedEvents(calendar: EKCalendar, state: CalendarPublishingState) throws -> [EKEvent] {
    var found: [String: EKEvent] = [:]
    var start = Date(timeIntervalSince1970: state.start)
    let end = Date(timeIntervalSince1970: state.horizon + 86400)
    // EventKit limits predicates to four years. Chunk explicitly; include the
    // entire published horizon so rescheduling/deletion still finds old copies.
    while start < end {
      let next = min(start.addingTimeInterval(3 * 365 * 86400), end)
      let predicate = store.predicateForEvents(withStart: start, end: next, calendars: [calendar])
      for event in store.events(matching: predicate) where marker(event, namespace: state.namespace) != nil {
        found[event.calendarItemIdentifier] = event
      }
      start = next
    }
    // IDs also find externally moved dates outside the original scan horizon.
    // Never follow a moved event into another calendar and modify it there.
    for id in cached(calendar, state).values.joined() {
      if let event = store.event(withIdentifier: id), marker(event, namespace: state.namespace) != nil {
        guard event.calendar.calendarIdentifier == calendar.calendarIdentifier else {
          throw CalendarFailure("CALENDAR_EVENT_MOVED")
        }
        found[event.calendarItemIdentifier] = event
      }
    }
    return Array(found.values)
  }

  func publishedKeys(calendarId: String, state: CalendarPublishingState) throws -> [String] {
    try requireAccess()
    return try ownedEvents(calendar: destination(calendarId), state: state)
      .compactMap { marker($0, namespace: state.namespace) }
  }

  func publish(calendarId: String, snapshot: CalendarSnapshot, state: CalendarPublishingState, removeAll: Bool = false, repair: Bool = false, beforeCommit: () throws -> Void) throws -> [String] {
    try requireAccess()
    let calendar = try destination(calendarId)
    let existing = try ownedEvents(calendar: calendar, state: state)
    let groups = Dictionary(grouping: existing) { marker($0, namespace: state.namespace)! }
    let removed = Set(snapshot.removed)
    // Cloud ownership can transfer before the calendar account finishes
    // downloading. Wait for the old publisher's complete manifest; never
    // mistake replication lag (or a different destination) for deleted events.
    // Not lag: events this device already saw here (deleted in a calendar app;
    // recreated below), explicit removals, and past events (never recreated).
    let now = Date().timeIntervalSince1970 * 1000
    let past = Set(snapshot.entries.filter { $0.start < now }.map(\.key))
    let missing = Set(state.publishedKeys).subtracting(groups.keys).subtracting(removed)
      .subtracting(past).subtracting(cached(calendar, state).keys)
    if !repair && !removeAll && !missing.isEmpty {
      throw CalendarFailure("CALENDAR_WAITING_FOR_EVENTS")
    }
    var retained = existing.filter { !removeAll && !removed.contains(marker($0, namespace: state.namespace)!) }
    for event in existing where removeAll || removed.contains(marker(event, namespace: state.namespace)!) {
      try store.remove(event, span: .thisEvent, commit: false)
    }
    if !removeAll {
      for item in snapshot.entries {
        guard item.start.isFinite, item.end.isFinite, item.end > item.start,
              item.start >= 0, item.end < 4102444800000 else {
          throw CalendarFailure("CALENDAR_INVALID_DATE")
        }
        let matches = (groups[item.key] ?? []).sorted { $0.calendarItemIdentifier < $1.calendarItemIdentifier }
        // Do not backfill past appointments. Known events still receive repairs.
        if matches.isEmpty && item.start < now { continue }
        let event = matches.first ?? EKEvent(eventStore: store)
        var parts = URLComponents(string: item.url)
        parts?.queryItems = [URLQueryItem(name: "calendar", value: state.namespace), URLQueryItem(name: "followUp", value: item.key)]
        guard let url = parts?.url else { throw CalendarFailure("CALENDAR_INVALID_URL") }
        let start = Date(timeIntervalSince1970: item.start / 1000)
        let end = Date(timeIntervalSince1970: item.end / 1000)
        if event.title != item.title || event.startDate != start || event.endDate != end ||
          event.url != url || (event.location ?? "") != item.location || event.isAllDay {
          event.calendar = calendar
          event.title = item.title
          event.startDate = start
          event.endDate = end
          event.isAllDay = false
          event.url = url
          event.location = item.location.isEmpty ? nil : item.location
          if matches.isEmpty { event.alarms = [] }
          try store.save(event, span: .thisEvent, commit: false)
        }
        if matches.isEmpty { retained.append(event) }
        for duplicate in matches.dropFirst() {
          try store.remove(duplicate, span: .thisEvent, commit: false)
          retained.removeAll { $0 === duplicate }
        }
      }
    }
    try beforeCommit()
    try store.commit()
    var committed: [String: [String]] = [:]
    for event in retained {
      guard let key = marker(event, namespace: state.namespace), let id = event.eventIdentifier else { continue }
      committed[key, default: []].append(id)
    }
    UserDefaults.standard.set(committed, forKey: cacheKey(calendar, state))
    return Array(Set(retained.compactMap { marker($0, namespace: state.namespace) }))
  }
}
