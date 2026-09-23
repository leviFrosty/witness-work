import ExpoModulesCore
import EventKit
import Foundation

public final class CalendarBridgeModule: Module {
  // Static executor covers module recreation / JS reloads in the same process.
  private static let queue = DispatchQueue(label: "witnesswork.calendar", qos: .utility)
  private let ownership = CalendarOwnership()
  private let events = CalendarEvents()
  private var changeObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("CalendarBridge")
    Events("onCalendarChange")

    OnStartObserving {
      self.stopObserving()
      self.changeObserver = NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: nil, queue: nil) { [weak self] _ in
        self?.sendEvent("onCalendarChange", [:])
      }
    }
    OnStopObserving { self.stopObserving() }
    OnDestroy { self.stopObserving() }

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
          try $0.configure(includeDetails: options["includeDetails"] as? Bool, defaultInclude: options["defaultInclude"] as? Bool)
        })
      }
    }
    AsyncFunction("setDestination") { (id: String, name: String, calendarId: String, title: String, account: String, resetManifest: Bool, expectedConfigurationToken: String, promise: Promise) in
      self.run(promise) {
        try self.dictionary(self.ownership.update {
          try self.recover(&$0, id: id)
          $0.register(id: id, name: name)
          try $0.validatePublishing(expectedConfigurationToken: expectedConfigurationToken)
          guard $0.primary == id, $0.busy == nil else { throw CalendarFailure("CALENDAR_NOT_PRIMARY") }
          let keys = resetManifest ? try self.events.publishedKeys(calendarId: calendarId, state: $0) : nil
          $0.setDestination(title: title, account: account, publishedKeys: keys)
        })
      }
    }
    // Disconnect while keeping events. The manifest is kept so reconnecting
    // to the same calendar still removes events for deleted follow-ups.
    AsyncFunction("forgetDestination") { (id: String, name: String, expectedConfigurationToken: String, promise: Promise) in
      self.run(promise) {
        try self.dictionary(self.ownership.update {
          try self.recover(&$0, id: id)
          $0.register(id: id, name: name)
          try $0.validatePublishing(expectedConfigurationToken: expectedConfigurationToken)
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
    AsyncFunction("createCalendar") { (id: String, name: String, sourceId: String, title: String, expectedConfigurationToken: String, promise: Promise) in
      self.run(promise) {
        // A new calendar is connected with a fresh manifest (see `repair`), so
        // events kept in a previous calendar don't block it.
        try self.withOwnership(id: id, name: name, creating: true, expectedConfigurationToken: expectedConfigurationToken) { state in
          try self.events.create(sourceId: sourceId, title: title, namespace: state.namespace)
        }
      }
    }
    AsyncFunction("publish") { (id: String, name: String, calendarId: String, raw: [String: Any], repair: Bool, expectedConfigurationToken: String, promise: Promise) in
      self.run(promise) {
        let snapshot = try JSONDecoder().decode(CalendarSnapshot.self, from: JSONSerialization.data(withJSONObject: raw))
        let keys: [String] = try self.withOwnership(id: id, name: name, horizon: snapshot.entries.filter(\.validDates).map { $0.end / 1000 }.max(), expectedConfigurationToken: expectedConfigurationToken, manifest: { $0 }) { state in
          return try self.events.publish(calendarId: calendarId, snapshot: snapshot, state: state, repair: repair) {
            try CalendarOperationJournal.write(calendarId: calendarId, namespace: state.namespace)
          }
        }
        return keys.count
      }
    }
    AsyncFunction("removePublished") { (id: String, name: String, calendarId: String, expectedConfigurationToken: String, promise: Promise) in
      self.run(promise) {
        let _: [String] = try self.withOwnership(id: id, name: name, disconnecting: true, expectedConfigurationToken: expectedConfigurationToken, manifest: { $0 }) { state in
          try self.events.publish(calendarId: calendarId, snapshot: CalendarSnapshot(title: "", entries: [], removed: [], deletedContactIds: []), state: state, removeAll: true) {
            try CalendarOperationJournal.write(calendarId: calendarId, namespace: state.namespace)
          }
        }
        return true
      }
    }
  }

  /// `manifest` records the published keys on release, so a successful write
  /// doesn't need a second full calendar scan.
  private func withOwnership<T>(id: String, name: String, horizon: Double? = nil, creating: Bool = false, disconnecting: Bool = false, expectedConfigurationToken: String? = nil, manifest: ((T) -> [String])? = nil, action: (CalendarPublishingState) throws -> T) throws -> T {
    var reservedCreation = false
    let state = try ownership.update {
      try self.recover(&$0, id: id)
      $0.register(id: id, name: name)
      if let token = expectedConfigurationToken { try $0.validatePublishing(expectedConfigurationToken: token) }
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
      guard $0.namespace == state.namespace else { throw CalendarFailure("CALENDAR_ACCOUNT_CHANGED") }
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
    result["configurationToken"] = state.publishingToken
    return result
  }

  private func stopObserving() {
    if let observer = changeObserver { NotificationCenter.default.removeObserver(observer) }
    changeObserver = nil
  }

  private func run<T>(_ promise: Promise, action: @escaping () throws -> T) {
    Self.queue.async {
      do { promise.resolve(try action()) }
      catch let error as CalendarFailure { promise.reject(error.code, error.code) }
      catch { promise.reject("CALENDAR_UNAVAILABLE", "Calendar operation failed") }
    }
  }
}
