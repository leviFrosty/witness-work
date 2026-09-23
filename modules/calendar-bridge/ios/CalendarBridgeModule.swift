import ExpoModulesCore
import Foundation

public final class CalendarBridgeModule: Module {
  // Static executor covers module recreation / JS reloads in the same process.
  private static let queue = DispatchQueue(label: "witnesswork.calendar", qos: .utility)
  private let ownership = CalendarOwnership()
  private let events = CalendarEvents()

  public func definition() -> ModuleDefinition {
    Name("CalendarBridge")

    AsyncFunction("registerDevice") { (id: String, name: String, promise: Promise) in
      self.run(promise) {
        try self.dictionary(self.ownership.update {
          try self.recover(&$0, id: id)
          $0.register(id: id, name: name)
        })
      }
    }
    AsyncFunction("selectPrimary") { (id: String, name: String, primary: String, promise: Promise) in
      self.run(promise) {
        try self.dictionary(self.ownership.update {
          try self.recover(&$0, id: id)
          $0.register(id: id, name: name)
          try $0.select(primary)
        })
      }
    }
    AsyncFunction("removeDevice") { (id: String, name: String, target: String, promise: Promise) in
      self.run(promise) {
        try self.dictionary(self.ownership.update {
          try self.recover(&$0, id: id)
          $0.register(id: id, name: name)
          try $0.remove(target)
        })
      }
    }
    // Shared settings any device may change; the primary reads them on publish.
    AsyncFunction("configure") { (id: String, name: String, options: [String: Any], promise: Promise) in
      self.run(promise) {
        try self.dictionary(self.ownership.update {
          try self.recover(&$0, id: id)
          $0.register(id: id, name: name)
          if let value = options["includeDetails"] as? Bool { $0.includeDetails = value }
          if let value = options["defaultInclude"] as? Bool { $0.defaultInclude = value }
        })
      }
    }
    AsyncFunction("setDestination") { (id: String, name: String, title: String, account: String, promise: Promise) in
      self.run(promise) {
        try self.dictionary(self.ownership.update {
          try self.recover(&$0, id: id)
          $0.register(id: id, name: name)
          guard $0.primary == id else { throw CalendarFailure("CALENDAR_NOT_PRIMARY") }
          $0.calendarTitle = title
          $0.calendarAccount = account
        })
      }
    }
    // Disconnect while keeping events. The manifest is kept so reconnecting
    // to the same calendar still removes events for deleted follow-ups.
    AsyncFunction("forgetDestination") { (id: String, name: String, promise: Promise) in
      self.run(promise) {
        try self.dictionary(self.ownership.update {
          try self.recover(&$0, id: id)
          $0.register(id: id, name: name)
          guard $0.primary == id else { throw CalendarFailure("CALENDAR_NOT_PRIMARY") }
          $0.disconnect()
        })
      }
    }
    AsyncFunction("requestAccess") { (promise: Promise) in
      self.events.requestAccess { allowed, error in
        if let error = error { promise.reject("CALENDAR_PERMISSION", error.localizedDescription) }
        else { promise.resolve(allowed) }
      }
    }
    AsyncFunction("destinations") { (promise: Promise) in
      self.run(promise) { try self.events.destinations() }
    }
    AsyncFunction("sources") { (promise: Promise) in
      self.run(promise) { try self.events.sources() }
    }
    AsyncFunction("createCalendar") { (id: String, name: String, sourceId: String, title: String, promise: Promise) in
      self.run(promise) {
        // A new calendar is connected with a fresh manifest (see `repair`), so
        // events kept in a previous calendar don't block it.
        try self.withOwnership(id: id, name: name, creating: true) { state in
          try self.events.create(sourceId: sourceId, title: title, namespace: state.namespace)
        }
      }
    }
    AsyncFunction("publish") { (id: String, name: String, calendarId: String, raw: [String: Any], repair: Bool, promise: Promise) in
      self.run(promise) {
        let snapshot = try JSONDecoder().decode(CalendarSnapshot.self, from: JSONSerialization.data(withJSONObject: raw))
        guard snapshot.entries.allSatisfy({ $0.start.isFinite && $0.end.isFinite && $0.start >= 0 && $0.end < 4102444800000 && $0.end > $0.start }) else {
          throw CalendarFailure("CALENDAR_INVALID_DATE")
        }
        let keys: [String] = try self.withOwnership(id: id, name: name, horizon: snapshot.entries.map { $0.end / 1000 }.max(), manifest: { $0 }) { state in
          try self.events.publish(calendarId: calendarId, snapshot: snapshot, state: state, repair: repair) {
            try CalendarOperationJournal.write(calendarId: calendarId, namespace: state.namespace)
          }
        }
        return keys.count
      }
    }
    AsyncFunction("removePublished") { (id: String, name: String, calendarId: String, promise: Promise) in
      self.run(promise) {
        let _: [String] = try self.withOwnership(id: id, name: name, disconnecting: true, manifest: { $0 }) { state in
          try self.events.publish(calendarId: calendarId, snapshot: CalendarSnapshot(entries: [], removed: []), state: state, removeAll: true) {
            try CalendarOperationJournal.write(calendarId: calendarId, namespace: state.namespace)
          }
        }
        return true
      }
    }
  }

  /// `manifest` records the published keys on release, so a successful write
  /// doesn't need a second full calendar scan.
  private func withOwnership<T>(id: String, name: String, horizon: Double? = nil, creating: Bool = false, disconnecting: Bool = false, manifest: ((T) -> [String])? = nil, action: (CalendarPublishingState) throws -> T) throws -> T {
    var reservedCreation = false
    let state = try ownership.update {
      try self.recover(&$0, id: id)
      $0.register(id: id, name: name)
      try $0.acquire(id: id)
      if creating {
        guard $0.creator == nil || $0.creator == id else { throw CalendarFailure("CALENDAR_CHOOSE_EXISTING") }
        reservedCreation = $0.creator == nil
        $0.creator = id
      }
      if let horizon = horizon { $0.horizon = max($0.horizon, horizon) }
    }
    let result: Result<T, Error>
    try CalendarOperationJournal.clear(namespace: state.namespace)
    do { result = .success(try action(state)) }
    catch { result = .failure(error) }
    // Always await release before allowing another native operation. If this
    // fails, the durable lock remains and the same device recovers it later.
    _ = try ownership.update {
      if reservedCreation, case .failure = result { $0.creator = nil }
      if case .success(let value) = result, let manifest = manifest, $0.busy == id {
        $0.publishedKeys = manifest(value)
        if disconnecting { $0.disconnect() }
        $0.recover(id: id)
      } else {
        try self.recover(&$0, id: id)
      }
    }
    // Released: a later crash must not re-scan this (possibly deleted) calendar.
    try? CalendarOperationJournal.clear(namespace: state.namespace)
    return try result.get()
  }

  private func recover(_ state: inout CalendarPublishingState, id: String) throws {
    guard state.busy == id else { return }
    // EventKit may have committed before the process stopped or CloudKit
    // release failed. Rebuild the manifest before allowing a new writer.
    // If the calendar is now unreadable (deleted, permission revoked), keep the
    // previous manifest rather than holding the lock forever: a stale manifest
    // only makes the next publish wait for, or skip, the events it lists.
    if let calendarId = try? CalendarOperationJournal.read(namespace: state.namespace),
       let keys = try? events.publishedKeys(calendarId: calendarId, state: state) {
      state.publishedKeys = keys
    }
    state.recover(id: id)
  }

  private func dictionary(_ state: CalendarPublishingState) throws -> [String: Any] {
    var result = try JSONSerialization.jsonObject(with: JSONEncoder().encode(state)) as! [String: Any]
    for key in ["primary", "pending", "busy"] where result[key] == nil { result[key] = NSNull() }
    return result
  }

  private func run<T>(_ promise: Promise, action: @escaping () throws -> T) {
    Self.queue.async {
      do { promise.resolve(try action()) }
      catch let error as CalendarFailure { promise.reject(error.code, error.code) }
      catch { promise.reject("CALENDAR_UNAVAILABLE", "Calendar operation failed") }
    }
  }
}
