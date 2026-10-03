import Foundation

/// Run with: swiftc modules/calendar-bridge/ios/CalendarPublishingState.swift
/// scripts/tests/calendar-publishing.swift -o /tmp/calendar-publishing-tests
@main struct CalendarPublishingTests {
  static func main() throws {
    var state = CalendarPublishingState()
    state.register(id: "a", name: "iPhone")
    state.register(id: "b", name: "iPad")
    try state.select("a")
    try state.acquire(id: "a")
    try state.select("b")
    precondition(state.primary == "a" && state.pending == "b" && state.busy == "a")
    do { try state.acquire(id: "b"); fatalError("Second device acquired an active writer") }
    catch is CalendarFailure { }
    state.recover(id: "b")
    precondition(state.primary == "a" && state.busy == "a", "Other device must never clear a lock")
    let restarted = try JSONDecoder().decode(CalendarPublishingState.self, from: JSONEncoder().encode(state))
    precondition(restarted.busy == "a", "A crash must preserve ownership")
    state.recover(id: "a")
    precondition(state.primary == "b" && state.pending == nil && state.busy == nil)
    do { try state.acquire(id: "a"); fatalError("Former primary can still publish") }
    catch is CalendarFailure { }
    try state.acquire(id: "b")
    try state.select("a")
    try state.select("b")
    precondition(state.pending == nil, "Selecting current owner cancels pending transfer")
    state.recover(id: "b")
    try state.select("a")
    precondition(state.primary == "a", "Idle ownership transfers immediately")
    state.register(id: "a", name: "Renamed iPhone")
    precondition(state.devices.count == 2 && state.devices.first?.name == "Renamed iPhone", "Renaming keeps list order")
    do { try state.select("unknown"); fatalError("Unregistered primary selected") }
    catch is CalendarFailure { }

    // Routine registration must not change the record (no CloudKit write).
    let before = state
    state.register(id: "a", name: "Renamed iPhone", now: (state.devices.first?.seen ?? 0) + 60)
    precondition(state == before, "Re-registering within a day is a no-op")
    state.register(id: "a", name: "Renamed iPhone", now: (state.devices.first?.seen ?? 0) + 90000)
    precondition(state != before, "Last seen refreshes daily")

    // Stale devices can be removed, but never the owner or a pending owner.
    state.register(id: "c", name: "Old iPhone")
    try state.remove("c")
    precondition(!state.devices.contains { $0.id == "c" })
    do { try state.remove("a"); fatalError("Removed the primary device") }
    catch is CalendarFailure { }

    state.calendarTitle = "WitnessWork"
    state.calendarAccount = "iCloud"
    state.creator = "a"
    state.disconnect()
    precondition(state.calendarTitle == nil && state.calendarAccount == nil && state.creator == nil)

    // Records written by the first build lack the optional fields.
    let legacy = #"{"namespace":"\#(UUID().uuidString)","devices":[{"id":"a","name":"iPhone"}],"publishedKeys":["k"],"start":0,"horizon":1}"#
    let decoded = try JSONDecoder().decode(CalendarPublishingState.self, from: Data(legacy.utf8))
    precondition(decoded.devices.first?.seen == nil && decoded.includeDetails == nil && decoded.publishedKeys == ["k"])

    // A stale snapshot cannot cross a destination/privacy/account change.
    var configured = decoded
    let oldToken = configured.publishingToken
    configured.setDestination(title: "WitnessWork", account: "iCloud", publishedKeys: ["history"])
    try assertFailure("CALENDAR_STATE_CHANGED") { try configured.validatePublishing(expectedConfigurationToken: oldToken) }
    try configured.validatePublishing(expectedConfigurationToken: configured.publishingToken)
    let connectedToken = configured.publishingToken
    configured.setDestination(title: "WitnessWork", account: "iCloud")
    precondition(configured.publishingToken == connectedToken && configured.publishedKeys == ["history"], "A handoff must preserve the complete replication manifest")
    try configured.configure(includeDetails: true, defaultInclude: nil)
    let privateToken = configured.publishingToken
    try configured.configure(includeDetails: false, defaultInclude: nil)
    try assertFailure("CALENDAR_STATE_CHANGED") { try configured.validatePublishing(expectedConfigurationToken: privateToken) }
    try assertFailure("CALENDAR_SHARED_NOT_FOUND") { try configured.validateDestination(title: "Old WitnessWork", account: "iCloud") }
    try configured.validateDestination(title: "WitnessWork", account: "iCloud")

    // Returning to a kept destination restores its history for JS tombstones.
    configured.setDestination(title: "Other", account: "Google", publishedKeys: ["new"])
    configured.setDestination(title: "WitnessWork", account: "iCloud", publishedKeys: ["history", "deleted"])
    precondition(configured.publishedKeys == ["history", "deleted"], "The old destination's cleanup must not use the replacement calendar's manifest")
    var otherAccount = configured
    otherAccount.namespace = UUID().uuidString
    otherAccount.configurationToken = nil
    try assertFailure("CALENDAR_STATE_CHANGED") { try otherAccount.validatePublishing(expectedConfigurationToken: oldToken) }

    configured.register(id: "a", name: "iPhone")
    try configured.select("a")
    try configured.acquire(id: "a")
    try assertFailure("CALENDAR_BUSY") { try configured.configure(includeDetails: true, defaultInclude: nil) }
    precondition(configured.includeDetails == false, "Privacy changes cannot take effect while an old snapshot is committing")
    configured.recover(id: "a")
    let beforeDisconnect = configured.publishingToken
    configured.disconnect()
    try assertFailure("CALENDAR_STATE_CHANGED") { try configured.validatePublishing(expectedConfigurationToken: beforeDisconnect) }

    // One invalid appointment neither expands the scan horizon nor blocks the
    // other entries. Missing/history policy is independent of EventKit.
    let future = CalendarEntry(key: "future", title: "Follow-up", start: 2_000_000, end: 3_800_000, url: "witnesswork://contact/c/v", location: "")
    var past = future
    past.key = "past"
    past.start = 100_000
    past.end = 1_900_000
    var invalid = future
    invalid.key = "invalid"
    invalid.end = 4_102_444_800_000
    let snapshot = CalendarSnapshot(title: "Follow-up", entries: [future, past, invalid], removed: ["deleted"], deletedContactIds: ["c/id"])
    precondition(future.validDates && past.validDates && !invalid.validDates)
    precondition(snapshot.missingKeys(published: ["future", "past", "seen", "deleted", "invalid"], existing: [], now: 1_000_000) == ["future", "seen", "invalid"], "Cached local identifiers must never turn a moved event into an automatic duplicate")
    precondition(snapshot.missingKeys(published: ["future", "past"], existing: ["future"], now: 1_000_000).isEmpty)
    precondition(CalendarSnapshot.contactId(from: URL(string: "witnesswork://contact/c%2Fid/v?calendar=n&followUp=v")) == "c/id", "Explicit contact tombstones must match escaped IDs without the source Visit")
    precondition(CalendarSnapshot.contactId(from: URL(string: "https://example.com/contact/c%2Fid/v")) == nil)
    print("Calendar publishing ownership tests passed")
  }

  static func assertFailure(_ code: String, _ action: () throws -> Void) throws {
    do { try action(); fatalError("Expected \(code)") }
    catch let error as CalendarFailure { precondition(error.code == code) }
  }
}
