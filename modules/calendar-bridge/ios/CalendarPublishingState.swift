import Foundation

struct CalendarDevice: Codable, Equatable {
  var id: String
  var name: String
  /// Seconds since 1970. Optional so records written by earlier builds decode.
  var seen: Double?
}

/// Persisted in a single private CloudKit record, updated with change-tag CAS.
/// A busy owner never expires: EventKit cannot fence an expired writer. After
/// a crash only the same device may recover its lock, on our serial executor.
///
/// Fields added after the first build are optional so older records decode.
struct CalendarPublishingState: Codable, Equatable {
  var primary: String?
  var pending: String?
  var busy: String?
  var namespace = UUID().uuidString
  var devices: [CalendarDevice] = []
  var publishedKeys: [String] = []
  var creator: String?
  var start = Date().timeIntervalSince1970 - 86400
  var horizon = Date().timeIntervalSince1970 + 86400
  /// Shared by every device so a handoff never changes what is published.
  var includeDetails: Bool?
  var defaultInclude: Bool?
  /// The connected calendar, so a new primary can find the same calendar.
  /// Calendar identifiers are device-local; title and account are not.
  var calendarTitle: String?
  var calendarAccount: String?

  /// Only refreshes `seen` daily so routine checks don't rewrite the record.
  mutating func register(id: String, name: String, now: Double = Date().timeIntervalSince1970) {
    if let index = devices.firstIndex(where: { $0.id == id }) {
      let device = devices[index]
      if device.name == name, let seen = device.seen, now - seen < 86400 { return }
      devices[index] = CalendarDevice(id: id, name: name, seen: now)
    } else {
      devices.append(CalendarDevice(id: id, name: name, seen: now))
    }
  }

  mutating func select(_ id: String) throws {
    guard devices.contains(where: { $0.id == id }) else {
      throw CalendarFailure("CALENDAR_DEVICE_UNKNOWN")
    }
    if busy == nil {
      primary = id
      pending = nil
    } else {
      pending = id == primary ? nil : id
    }
  }

  /// Stale devices (old phones, reinstalls) can be removed unless they hold or
  /// are about to receive publishing.
  mutating func remove(_ id: String) throws {
    guard id != primary, id != pending, id != busy else {
      throw CalendarFailure("CALENDAR_DEVICE_IN_USE")
    }
    devices.removeAll { $0.id == id }
  }

  mutating func recover(id: String) {
    guard busy == id else { return }
    busy = nil
    if let next = pending {
      primary = next
      pending = nil
    }
  }

  mutating func acquire(id: String) throws {
    guard primary == id, busy == nil else {
      throw CalendarFailure("CALENDAR_NOT_PRIMARY")
    }
    busy = id
  }

  /// Disconnecting stops publishing everywhere; the next connection may create
  /// a calendar again.
  mutating func disconnect() {
    calendarTitle = nil
    calendarAccount = nil
    creator = nil
  }
}

struct CalendarFailure: LocalizedError {
  let code: String
  init(_ code: String) { self.code = code }
  var errorDescription: String? { code }
}
