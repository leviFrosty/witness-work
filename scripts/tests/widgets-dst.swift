import Foundation

/// The iPhone widgets' day rollover on a daylight saving day. Run by
/// `watch-dst.node.mjs` once per time zone, with `TZ` set and the transition
/// day (`YYYY-MM-DD`) as its argument.
@main struct WidgetsDaylightSavingTests {
  static func main() {
    let args = CommandLine.arguments
    let parts = args[1].split(separator: "-").map { Int($0)! }
    let zone = TimeZone.current.identifier
    let calendar = SnapshotDay.gregorian
    func at(_ offset: Int, _ hour: Int, _ minute: Int = 0) -> Date {
      calendar.date(
        from: DateComponents(
          year: parts[0], month: parts[1], day: parts[2] + offset, hour: hour, minute: minute))!
    }
    func check(_ ok: Bool, _ message: @autoclosure () -> String) {
      precondition(ok, "\(zone) \(args[1]): \(message())")
    }

    // "Today" rolls over as each day starts, from the evening before and from
    // early and late on the day.
    for (now, next) in [(at(-1, 22), 0), (at(0, 0, 30), 1), (at(0, 23, 30), 1)] {
      let timeline = SnapshotDay.timeline(from: now)
      check(timeline.reload == at(next, 0), "reload from \(now): \(timeline.reload)")
      check(
        timeline.dates == [now, at(next, 0), at(next + 1, 0)],
        "entries from \(now): \(timeline.dates)")
    }
    check(SnapshotDay.key(at(0, 0)) == args[1] && SnapshotDay.key(at(0, 23, 59)) == args[1], "day key")
    check(SnapshotDay.key(at(1, 0)) != args[1], "the next day's key")

    // A Follow-up at 10:00 tomorrow reads "Tomorrow" all day, and today's at
    // 10:00 reads only its time.
    let locale = Locale(identifier: "en_US")
    func label(_ date: Date, _ now: Date) -> String {
      SnapshotDay.appointmentLabel(date, now: now, tomorrowLabel: "Tomorrow", locale: locale)
    }
    for now in [at(-1, 0, 30), at(-1, 23, 30)] {
      check(label(at(0, 10), now).hasPrefix("Tomorrow 10:00"), "from \(now): \(label(at(0, 10), now))")
    }
    for now in [at(0, 0, 30), at(0, 23, 30)] {
      check(label(at(1, 10), now).hasPrefix("Tomorrow 10:00"), "from \(now): \(label(at(1, 10), now))")
    }
    check(label(at(0, 10), at(0, 0, 30)).hasPrefix("10:00"), "today: \(label(at(0, 10), at(0, 0, 30)))")
    print("widgets daylight saving \(zone) \(args[1]): ok")
  }
}
