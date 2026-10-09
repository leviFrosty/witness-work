import CloudKit
import Foundation

/// All callers run on CalendarBridgeModule's serial queue. Network failures
/// never fall back to a cached owner. A lost response may leave our lock held;
/// the same device recovers it before the next operation, never another device.
final class CalendarOwnership {
  // Calendar ownership is opt-in; don't instantiate CloudKit at app launch.
  private var database: CKDatabase { CKContainer.default().privateCloudDatabase }
  private let recordID = CKRecord.ID(recordName: "calendar-publishing-v1")
  /// CloudKit normally answers well within this; past it the operation counts
  /// as failed rather than holding the serial queue (and every later calendar
  /// operation) indefinitely.
  private static let timeout: TimeInterval = 60
  private var lastState: (state: CalendarPublishingState, at: Date)?

  /// The state the last `update` read or wrote, if that was within `maxAge`.
  /// Only for read-only checks that fall back to `update` when it's stale.
  func recentState(maxAge: TimeInterval = 60) -> CalendarPublishingState? {
    guard let last = lastState, Date().timeIntervalSince(last.at) < maxAge else { return nil }
    return last.state
  }

  func update(_ change: (inout CalendarPublishingState) throws -> Void) throws -> CalendarPublishingState {
    lastState = nil
    let state = try save(change)
    lastState = (state, Date())
    return state
  }

  private func save(_ change: (inout CalendarPublishingState) throws -> Void) throws -> CalendarPublishingState {
    for _ in 0..<5 {
      let record: CKRecord
      do {
        record = try wait { self.database.fetch(withRecordID: self.recordID, completionHandler: $0) }
      } catch let error as CKError where error.code == .unknownItem {
        record = CKRecord(recordType: "CalendarPublisher", recordID: recordID)
      }
      var state: CalendarPublishingState
      let stored: CalendarPublishingState?
      if let json = record["state"] as? String, let data = json.data(using: .utf8) {
        stored = try JSONDecoder().decode(CalendarPublishingState.self, from: data)
      } else {
        stored = nil
      }
      state = stored ?? CalendarPublishingState()
      try change(&state)
      // Routine checks (foreground, settings) must not rewrite the shared
      // record: every write races other devices' conditional saves.
      if let stored = stored, stored == state { return state }
      record["state"] = String(data: try JSONEncoder().encode(state), encoding: .utf8)! as CKRecordValue
      do {
        let _: CKRecord = try wait { completion in
          self.database.modifyRecords(saving: [record], deleting: [], savePolicy: .ifServerRecordUnchanged, atomically: false) { result in
            switch result {
            case .success(let results):
              switch results.saveResults[record.recordID] {
              case .success(let saved)?: completion(saved, nil)
              case .failure(let error)?: completion(nil, error)
              case nil: completion(nil, CalendarFailure("CALENDAR_UNAVAILABLE"))
              }
            case .failure(let error): completion(nil, error)
            }
          }
        }
        return state
      } catch let error as CKError where Self.isConflict(error) {
        continue
      }
    }
    throw CalendarFailure("CALENDAR_BUSY")
  }

  private static func isConflict(_ error: CKError) -> Bool {
    if error.code == .serverRecordChanged { return true }
    return error.partialErrorsByItemID?.values.contains {
      ($0 as? CKError)?.code == .serverRecordChanged
    } ?? false
  }

  /// The caller is a utility queue, never the main thread. A save that lands
  /// after the timeout is still a conditional one: the next update reads it,
  /// and a lock it took is this device's to recover.
  private func wait<T>(_ start: (@escaping (T?, Error?) -> Void) -> Void) throws -> T {
    let semaphore = DispatchSemaphore(value: 0)
    let lock = NSLock()
    var outcome: Result<T, Error>?
    start { value, error in
      lock.lock()
      defer { lock.unlock() }
      if let error = error { outcome = .failure(error) }
      else if let value = value { outcome = .success(value) }
      else { outcome = .failure(CalendarFailure("CALENDAR_UNAVAILABLE")) }
      semaphore.signal()
    }
    guard semaphore.wait(timeout: .now() + Self.timeout) == .success else {
      throw CalendarFailure("CALENDAR_UNAVAILABLE")
    }
    lock.lock()
    defer { lock.unlock() }
    return try outcome!.get()
  }
}
