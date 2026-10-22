import Foundation

/// The Apple Watch's day math on a daylight saving day, as
/// `DaylightSavingTest.kt` checks Wear OS's. Run by `watch-dst.node.mjs`
/// (`pnpm test:watch-native`) once per time zone, with `TZ` set and the
/// transition day (`YYYY-MM-DD`), its length in hours, and the phone's
/// contract fixture (`phone-context.json`) as arguments.
@main struct WatchDaylightSavingTests {
  static func main() throws {
    let args = CommandLine.arguments
    let parts = args[1].split(separator: "-").map { Int($0)! }
    let dayHours = Double(args[2])!
    let fixture = try Data(contentsOf: URL(fileURLWithPath: args[3]))
    let zone = TimeZone.current.identifier

    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .current
    /// Wall-clock time on the transition day, `offset` days away.
    func at(_ offset: Int, _ hour: Int, _ minute: Int = 0) -> Date {
      calendar.date(
        from: DateComponents(
          year: parts[0], month: parts[1], day: parts[2] + offset, hour: hour, minute: minute))!
    }
    func check(_ ok: Bool, _ message: @autoclosure () -> String) {
      precondition(ok, "\(zone) \(args[1]): \(message())")
    }
    let day = at(0, 0)
    check(
      at(1, 0).timeIntervalSince(day) == dayHours * 3600,
      "the day is \(dayHours)h long, not \(at(1, 0).timeIntervalSince(day) / 3600)h")

    var json = try JSONSerialization.jsonObject(with: fixture) as! [String: Any]
    var snapshotJSON = json["snapshot"] as! [String: Any]
    func snapshot() throws -> WatchSnapshot {
      json["snapshot"] = snapshotJSON
      return try JSONDecoder().decode(
        PhoneContext.self, from: JSONSerialization.data(withJSONObject: json)
      ).snapshot!
    }
    let template = (snapshotJSON["upNext"] as! [[String: Any]])[0]
    func item(_ id: String, _ start: Date, timed: Bool = true, day: String? = nil) -> [String: Any] {
      template.merging([
        "id": id, "timed": timed, "day": day ?? NSNull(),
        "start": start.timeIntervalSince1970 * 1000,
      ]) { $1 }
    }

    // A week of complication entries from the day before: each at a midnight.
    let week = MonthProgress.midnights(after: at(-1, 12), count: 8, calendar: .current)
    check(week == (0..<8).map { at($0, 0) }, "midnights: \(week)")
    check(UpNext.timelineEnd(after: at(-1, 12)) == at(7, 0), "Up Next's timeline end")

    // A Plan at 10:00 on the day, sent as its wall-clock time, and a Plan
    // without a time, which spans the day.
    snapshotJSON["upNext"] = [
      item("timed", at(0, 10)),
      item("untimed", day, timed: false, day: args[1]),
      item("tomorrow", at(1, 10)),
    ]
    let upNext = try snapshot()
    let timed = upNext.upNext![0]
    let untimed = upNext.upNext![1]
    let tomorrow = upNext.upNext![2]
    check(untimed.startDate == day, "an untimed Plan starts at midnight")
    check(UpNext.shownUntil(untimed) == at(1, 0), "an untimed Plan ends at the next midnight")
    check(
      UpNext.items(upNext, at: at(0, 23, 30)).map(\.id) == ["untimed", "tomorrow"],
      "an untimed Plan stays up through 23:30")
    check(
      UpNext.items(upNext, at: at(1, 0)).map(\.id) == ["tomorrow"],
      "an untimed Plan leaves at midnight")
    let tomorrowLabel = L10n.t("tomorrow", upNext)
    check(UpNext.dayLabel(timed, at: at(-1, 0, 30), upNext) == tomorrowLabel, "tomorrow, from 0:30")
    check(UpNext.dayLabel(timed, at: at(-1, 23, 30), upNext) == tomorrowLabel, "tomorrow, from 23:30")
    check(UpNext.dayLabel(timed, at: at(0, 0, 30), upNext) == nil, "today, from 0:30")
    check(UpNext.dayLabel(untimed, at: at(0, 23, 30), upNext) == nil, "today, at 23:30")
    check(UpNext.dayLabel(tomorrow, at: at(0, 23, 30), upNext) == tomorrowLabel, "tomorrow, at 23:30")
    check(UpNext.dayLabel(tomorrow, at: at(0, 0, 30), upNext) == tomorrowLabel, "tomorrow, at 0:30")
    check(!UpNext.isSoon(timed, at: at(0, 8, 59)) && UpNext.isSoon(timed, at: at(0, 9)), "soon at 9:00")
    let changes = UpNext.changes(upNext, after: at(-1, 12))
    check(
      Set([at(0, 0), at(0, 9), at(0, 10), at(0, 10, 15), at(1, 0), at(1, 9)]).isSubset(of: changes),
      "Up Next changes: \(changes)")

    // Month progress on the day: its own day all day, and the same daily pace
    // at midnight and late in the evening.
    snapshotJSON["monthKey"] = String(args[1].prefix(7))
    snapshotJSON["plannedThroughDay"] = NSNull()
    snapshotJSON["publisherState"] = "reportedToday"
    snapshotJSON["generatedAt"] = at(0, 0, 30).timeIntervalSince1970 * 1000
    let month = try snapshot()
    for (date, key) in [(at(0, 0), args[1]), (at(0, 23, 59), args[1])] {
      check(WatchSnapshot.dayKey(for: date) == key, "day key at \(date)")
    }
    check(WatchSnapshot.dayKey(for: at(1, 0)) != args[1], "the next day's key")
    func pace(_ date: Date) -> String? {
      MonthProgress(snapshot: month, outbox: [], resolvedEntryIds: [], at: date)?.paceText
    }
    check(pace(at(0, 0)) == pace(at(0, 23, 30)), "the daily pace holds all day")
    check(month.publisherState(at: at(0, 23, 59)) == "reportedToday", "reported today, at 23:59")
    check(month.publisherState(at: at(1, 0)) == "reportedThisMonth", "reported this month, at midnight")

    // The timer across the clock change: 0:30 to 4:30 is real elapsed time.
    let timer = TimerSnapshot(
      isRunning: true, startedAt: at(0, 0, 30).timeIntervalSince1970, accumulatedMs: 0, revision: 1)
    let hours = Int(timer.elapsedMs(now: at(0, 4, 30)) / 3_600_000)
    check(hours == 4 + Int(dayHours) - 24, "timer hours: \(hours)")
    check(timer.effectiveStartDate(now: at(0, 4, 30)) == at(0, 0, 30), "timer start")
    print("watch daylight saving \(zone) \(args[1]): ok")
  }
}
