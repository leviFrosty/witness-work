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
    print("Calendar publishing ownership tests passed")
  }
}
