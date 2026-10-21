import Foundation

// Canonical here and copied into `targets/watch-widgets/Shared` by
// `scripts/sync-widget-shared.mjs`, so the app and complications agree.

/// The month's progress as the watch shows it: the iPhone's snapshot plus time
/// added on the watch that the iPhone hasn't saved yet, so the total moves as
/// soon as time is added. Rolls over to next month at midnight without the
/// iPhone.
struct MonthProgress: Equatable {
  /// E.g. `October`.
  let monthName: String
  let showsTimeEntry: Bool
  /// Compact total, e.g. `12.5h`.
  let total: String
  /// `total` without its unit, e.g. `12.5`, for the middle of a circular
  /// gauge: Apple's show a bare number there, and a unit shrinks the digits.
  let hours: String
  /// The total in the user's Duration Format when the iPhone's figure is
  /// current; otherwise `total`.
  let formatted: String
  /// Hours the user set, possibly with a decimal; 0 means no goal.
  let goalHours: Double
  /// 0...1 toward the goal; `nil` without one.
  let fraction: Double?
  /// 0...1: where the user's Plans put them by today; `nil` without Plans or
  /// once the goal is reached.
  let paceFraction: Double?
  /// Ahead/behind or per-day line; `nil` when there's nothing to show or the
  /// goal is reached.
  let paceText: String?
  let goalReached: Bool
  /// `unreported`, `reportedToday` or `reportedThisMonth`.
  let publisherState: String

  /// `nil` when the snapshot describes neither the month of `date` nor the
  /// month before it.
  init?(
    snapshot: WatchSnapshot, outbox: [OutboxItem], resolvedEntryIds: [String],
    at date: Date = .now
  ) {
    let key = WatchSnapshot.monthKey(for: date)
    let baseMinutes: Int?
    let planned: [Int]?
    var state: String
    if snapshot.isCurrent(at: date) {
      monthName = snapshot.monthName ?? L10n.t("month", snapshot)
      showsTimeEntry = snapshot.showsTimeEntry
      goalHours = snapshot.goalHours
      baseMinutes = snapshot.monthMinutes
      planned = snapshot.plannedThroughDay
      state = snapshot.publisherState(at: date)
    } else if let next = snapshot.nextMonth, next.monthKey == key {
      monthName = next.monthName
      showsTimeEntry = next.showsTimeEntry
      goalHours = next.goalHours
      baseMinutes = 0
      planned = nil
      state = "unreported"
    } else {
      return nil
    }

    // Entries the iPhone hasn't counted yet, made this month.
    let counted = Set(resolvedEntryIds + (snapshot.reflectedEntryIds ?? []))
    let unsynced = outbox.compactMap(\.request.entry).filter {
      !counted.contains($0.id) && $0.date.hasPrefix(key + "-")
    }
    if unsynced.contains(where: { $0.date == WatchSnapshot.dayKey(for: date) }) {
      state = "reportedToday"
    } else if !unsynced.isEmpty, state == "unreported" {
      state = "reportedThisMonth"
    }
    publisherState = state

    guard let baseMinutes else {
      // Stored by an iPhone app from before the watch added time itself.
      let language = Self.language(snapshot)
      total = language.digits(snapshot.monthCompact)
      let unit = L10n.t("hoursCompact", snapshot)
      hours = total.hasSuffix(unit) ? String(total.dropLast(unit.count)) : total
      formatted = language.digits(snapshot.monthFormatted)
      fraction = goalHours > 0 ? min(max(snapshot.progress, 0), 1) : nil
      goalReached = goalHours > 0 && snapshot.progress >= 1
      paceFraction = nil
      paceText = goalReached ? nil : snapshot.paceText
      return
    }

    // Credit Time waits for the iPhone, which applies the credit cap.
    // Standard time always counts in full. An unknown Type is saved as
    // Standard.
    let creditIds = Set(snapshot.categories.filter { $0.isCredit != false }.map(\.id))
    let unsyncedMinutes = unsynced
      .filter { $0.categoryId.map { !creditIds.contains($0) } ?? true }
      .reduce(0) { $0 + $1.hours * 60 + $1.minutes }
    let minutes = baseMinutes + unsyncedMinutes

    total = Self.compact(minutes, snapshot)
    hours = Self.hoursNumber(minutes, snapshot)
    formatted = unsyncedMinutes == 0 && snapshot.isCurrent(at: date)
      ? Self.language(snapshot).digits(snapshot.monthFormatted) : total

    let goalMinutes = Int((goalHours * 60).rounded())
    guard goalMinutes > 0 else {
      fraction = nil
      goalReached = false
      paceFraction = nil
      paceText = nil
      return
    }
    fraction = min(max(Double(minutes) / Double(goalMinutes), 0), 1)
    goalReached = minutes >= goalMinutes
    guard !goalReached else {
      paceFraction = nil
      paceText = nil
      return
    }

    // Same pace as the iPhone: against the Plans through today when there are
    // any, otherwise time per day to the goal.
    let calendar = Calendar(identifier: .gregorian)
    let day = calendar.component(.day, from: date)
    if let planned, planned.indices.contains(day - 1), planned[day - 1] > 0 {
      let plannedMinutes = planned[day - 1]
      paceFraction = min(Double(plannedMinutes) / Double(goalMinutes), 1)
      paceText = L10n.t(
        minutes >= plannedMinutes ? "aheadOfSchedule" : "behindSchedule", snapshot)
    } else {
      paceFraction = nil
      let perDay = Self.minutesPerDayToGoal(goalMinutes - minutes, at: date, calendar: calendar)
      // The phone's sentence, so each language places the value itself.
      paceText = L10n.t("hoursPerDayToGoalValue", snapshot)
        .replacingOccurrences(of: "{{value}}", with: Self.compact(perDay, snapshot))
    }
  }

  /// The iPhone's Daily Pace (`dailyPace`): `remaining` minutes over the days
  /// after `date`'s, or all of them on the month's last day, rounded up to a
  /// tenth of an hour (`formatNeededMinutes`) so keeping to it is enough.
  /// Counts calendar days, so a complication's entry for midnight agrees with
  /// the iPhone all that day.
  static func minutesPerDayToGoal(_ remaining: Int, at date: Date, calendar: Calendar) -> Int {
    let day = calendar.component(.day, from: date)
    let daysInMonth = calendar.range(of: .day, in: .month, for: date)?.count ?? day
    let tenthPerDay = max(daysInMonth - day, 1) * 6
    return (max(remaining, 0) + tenthPerDay - 1) / tenthPerDay * 6
  }

  /// The iPhone's `formatMinutesCompact`: `30m`, `2h`, `1.5h`, `11.5h`; `0h`
  /// for zero, as the snapshot's `monthCompact` has it. Digits are the app
  /// Language's (`AppLanguage`).
  static func compact(_ minutes: Int, _ snapshot: WatchSnapshot?) -> String {
    if minutes > 0, minutes < 60 {
      return language(snapshot).number(minutes) + L10n.t("minutesCompact", snapshot)
    }
    return hoursNumber(minutes, snapshot) + L10n.t("hoursCompact", snapshot)
  }

  /// Hours as `compact` rounds them, without a unit: `0`, `0.5`, `1.5`, `11.5`.
  static func hoursNumber(_ minutes: Int, _ snapshot: WatchSnapshot?) -> String {
    let hours = Double(max(minutes, 0)) / 60
    return language(snapshot).decimal((hours * 10).rounded() / 10)
  }

  private static func language(_ snapshot: WatchSnapshot?) -> AppLanguage {
    snapshot?.appLanguage ?? AppLanguage(rtl: nil, numberLocale: nil)
  }
}
