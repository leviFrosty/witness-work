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
    expect(pace(at(5)), "1.3h hoursPerDayToGoal", "Oct 5")
    // Over the 10 days after Oct 21, rounded up to a tenth: the complication's
    // midnight entry used to count 11.
    expect(pace(at(21, hour: 0)), "3.4h hoursPerDayToGoal", "Oct 21, midnight")
    expect(pace(at(21, hour: 23)), "3.4h hoursPerDayToGoal", "Oct 21, evening")
    // One day after Oct 30 (it used to count 2: half the pace), and all of it
    // on the 31st.
    expect(pace(at(30, hour: 0)), "33.5h hoursPerDayToGoal", "Oct 30, midnight")
    expect(pace(at(31, hour: 0)), "33.5h hoursPerDayToGoal", "Oct 31, midnight")
    // Rounded up, so keeping to it is enough: 61 minutes over 1 day is 1.1h.
    precondition(MonthProgress.minutesPerDayToGoal(61, at: at(30), calendar: calendar) == 66)
    precondition(MonthProgress.minutesPerDayToGoal(60, at: at(30), calendar: calendar) == 60)
    print("watch month progress: ok")
  }
}
