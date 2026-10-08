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
  /// Whole hours the user set; 0 means no goal.
  let goalHours: Int
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
      total = snapshot.monthCompact
      let unit = L10n.t("hoursCompact", snapshot)
      hours = total.hasSuffix(unit) ? String(total.dropLast(unit.count)) : total
      formatted = snapshot.monthFormatted
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
    hours = Self.hoursNumber(minutes)
    formatted = unsyncedMinutes == 0 && snapshot.isCurrent(at: date)
      ? snapshot.monthFormatted : total

    let goalMinutes = goalHours * 60
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
    // any, otherwise hours per remaining day.
    let calendar = Calendar(identifier: .gregorian)
    let day = calendar.component(.day, from: date)
    if let planned, planned.indices.contains(day - 1), planned[day - 1] > 0 {
      let plannedMinutes = planned[day - 1]
      paceFraction = min(Double(plannedMinutes) / Double(goalMinutes), 1)
      paceText = L10n.t(
        minutes >= plannedMinutes ? "aheadOfSchedule" : "behindSchedule", snapshot)
    } else {
      paceFraction = nil
      let remainingHours = Double(goalMinutes - minutes) / 60
      let daysLeft = Self.daysLeftInMonth(after: date, calendar: calendar)
      let perDay = daysLeft == 0
        ? remainingHours : (remainingHours / Double(daysLeft) * 10).rounded() / 10
      paceText = Self.compact(Int((perDay * 60).rounded()), snapshot)
        + " " + L10n.t("hoursPerDayToGoal", snapshot)
    }
  }

  /// Whole days from `date` to the start of next month, like the iPhone's
  /// `getDaysLeftInCurrentMonth`.
  private static func daysLeftInMonth(after date: Date, calendar: Calendar) -> Int {
    guard let monthStart = calendar.dateInterval(of: .month, for: date)?.start,
          let nextMonth = calendar.date(byAdding: .month, value: 1, to: monthStart)
    else { return 0 }
    return calendar.dateComponents([.day], from: date, to: nextMonth).day ?? 0
  }

  /// The iPhone's `formatMinutesCompact`: `30m`, `2h`, `1.5h`, `11.5h`; `0h`
  /// for zero, as the snapshot's `monthCompact` has it.
  static func compact(_ minutes: Int, _ snapshot: WatchSnapshot?) -> String {
    if minutes > 0, minutes < 60 { return "\(minutes)" + L10n.t("minutesCompact", snapshot) }
    return hoursNumber(minutes) + L10n.t("hoursCompact", snapshot)
  }

  /// Hours as `compact` rounds them, without a unit: `0`, `0.5`, `1.5`, `11.5`.
  static func hoursNumber(_ minutes: Int) -> String {
    let hours = Double(max(minutes, 0)) / 60
    let tenths = (hours * 10).rounded() / 10
    return tenths == tenths.rounded()
      ? "\(Int(tenths))" : String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), tenths)
  }
}
