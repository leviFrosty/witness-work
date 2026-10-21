import Foundation

/// The Apple Watch's pace line, as `MonthProgressTest.kt` checks the Wear OS
/// one. Run by `scripts/tests/watch-month-progress.node.mjs` (`pnpm
/// test:watch-native`), with `TZ=America/Chicago` and the phone's contract
/// fixture (`phone-context.json`: October 2026, 16.5h of a 50h goal) as its
/// argument.
@main struct WatchMonthProgressTests {
  static func main() throws {
    let fixture = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
    // Without Plans, so the pace line is the time per day to the goal.
    var json = try JSONSerialization.jsonObject(with: fixture) as! [String: Any]
    var snapshotJSON = json["snapshot"] as! [String: Any]
    snapshotJSON["plannedThroughDay"] = NSNull()
    json["snapshot"] = snapshotJSON
    let snapshot = try JSONDecoder().decode(
      PhoneContext.self, from: JSONSerialization.data(withJSONObject: json)
    ).snapshot!

    let calendar = Calendar(identifier: .gregorian)
    func at(_ day: Int, hour: Int = 9) -> Date {
      calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour))!
    }
    func pace(_ date: Date) -> String? {
      MonthProgress(snapshot: snapshot, outbox: [], resolvedEntryIds: [], at: date)?.paceText
    }
    func expect(_ actual: String?, _ expected: String, _ message: String) {
      precondition(actual == expected, "\(message): \(actual ?? "nil") != \(expected)")
    }

    // 2010 minutes over the 26 days after Oct 5.
    expect(pace(at(5)), "1.3h per day to goal!", "Oct 5")
    // Over the 10 days after Oct 21, rounded up to a tenth: the complication's
    // midnight entry used to count 11.
    expect(pace(at(21, hour: 0)), "3.4h per day to goal!", "Oct 21, midnight")
    expect(pace(at(21, hour: 23)), "3.4h per day to goal!", "Oct 21, evening")
    // One day after Oct 30 (it used to count 2: half the pace), and all of it
    // on the 31st.
    expect(pace(at(30, hour: 0)), "33.5h per day to goal!", "Oct 30, midnight")
    expect(pace(at(31, hour: 0)), "33.5h per day to goal!", "Oct 31, midnight")
    // Rounded up, so keeping to it is enough: 61 minutes over 1 day is 1.1h.
    precondition(MonthProgress.minutesPerDayToGoal(61, at: at(30), calendar: calendar) == 66)
    precondition(MonthProgress.minutesPerDayToGoal(60, at: at(30), calendar: calendar) == 60)
    // A goal with a decimal, which the app allows (37.5h), decodes and counts
    // in full: it used to fail the whole snapshot.
    snapshotJSON["goalHours"] = 37.5
    json["snapshot"] = snapshotJSON
    let decimal = try JSONDecoder().decode(
      PhoneContext.self, from: JSONSerialization.data(withJSONObject: json)
    ).snapshot!
    let decimalProgress = MonthProgress(snapshot: decimal, outbox: [], resolvedEntryIds: [], at: at(5))!
    precondition(decimalProgress.goalHours == 37.5)
    precondition(abs(decimalProgress.fraction! - 990.0 / 2250) < 1e-9)
    // An untimed Plan starts at midnight of its day in the watch's zone, though
    // the iPhone sent another zone's midnight (New York's, 11 PM the day before
    // in Chicago).
    var upNextJSON = (snapshotJSON["upNext"] as! [[String: Any]])[1]
    upNextJSON["timed"] = false
    upNextJSON["start"] = 1_792_641_600_000.0  // Oct 22, 00:00 in New York
    upNextJSON["day"] = "2026-10-22"
    let untimed = try JSONDecoder().decode(
      UpNextItem.self, from: JSONSerialization.data(withJSONObject: upNextJSON))
    precondition(untimed.startDate == at(22, hour: 0), "untimed: \(untimed.startDate)")
    upNextJSON["day"] = NSNull()
    let older = try JSONDecoder().decode(
      UpNextItem.self, from: JSONSerialization.data(withJSONObject: upNextJSON))
    precondition(older.startDate == at(21, hour: 23), "older iPhone app: \(older.startDate)")
    // With Plans: only time logged through today counts, as on the iPhone. The
    // fixture's 990 minutes are dated the 2nd and 3rd, so the 7th is ahead of
    // its 120 planned minutes; dated the 20th instead, the 7th is behind.
    var plannedJSON = try JSONSerialization.jsonObject(with: fixture) as! [String: Any]
    var plannedSnapshotJSON = plannedJSON["snapshot"] as! [String: Any]
    func planned(_ logged: [Int]?) throws -> WatchSnapshot {
      plannedSnapshotJSON["loggedThroughDay"] = logged ?? NSNull()
      plannedJSON["snapshot"] = plannedSnapshotJSON
      return try JSONDecoder().decode(
        PhoneContext.self, from: JSONSerialization.data(withJSONObject: plannedJSON)
      ).snapshot!
    }
    func schedule(_ snapshot: WatchSnapshot, _ date: Date) -> String? {
      MonthProgress(snapshot: snapshot, outbox: [], resolvedEntryIds: [], at: date)?.paceText
    }
    let fixtureLogged = plannedSnapshotJSON["loggedThroughDay"] as! [Int]
    expect(schedule(try planned(fixtureLogged), at(7)), "aheadOfSchedule", "Oct 7, logged early")
    let later = (1...31).map { $0 >= 20 ? 990 : 0 }
    expect(schedule(try planned(later), at(7)), "behindSchedule", "Oct 7, logged on the 20th")
    expect(schedule(try planned(later), at(20)), "aheadOfSchedule", "Oct 20")
    // An iPhone app from before `loggedThroughDay` paces with the month's total.
    expect(schedule(try planned(nil), at(7)), "aheadOfSchedule", "Oct 7, older iPhone app")
    // The complications' week of midnights, across the end of daylight saving
    // time (Nov 1 in Chicago): each the start of the next day. watchOS used to
    // carry only the first.
    let week = MonthProgress.midnights(after: at(30), count: 8, calendar: calendar)
    let expectedWeek = (0..<8).map {
      calendar.date(from: DateComponents(year: 2026, month: 10, day: 31 + $0))!
    }
    precondition(week == expectedWeek, "midnights: \(week)")
    precondition(
      MonthProgress.midnights(after: at(31, hour: 0), count: 1, calendar: calendar)
        == [calendar.date(from: DateComponents(year: 2026, month: 11, day: 1))!],
      "from a midnight")
    print("watch month progress: ok")
  }
}
