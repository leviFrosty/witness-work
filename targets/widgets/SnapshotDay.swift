import Foundation

// MARK: - Day rollover
//
// The app builds `snapshot.json` for one local day (`builtOn`) and writes it
// again only while it runs, so the widgets can show one snapshot for days.
// Each timeline entry moves what depends on the date from that day to its own,
// as the watch complications do (`WatchSnapshot.publisherState(at:)`):
//
//   - "Reported today" becomes "reported this month" the next day.
//   - From the 1st, the Report and Calendar widgets show `nextMonth`, which the
//     app built for that day. A later month starts from zero.
//   - The calendar's today, past days and current week move along.
//   - Follow-ups turn overdue, and "Tomorrow 3:00 PM" is rewritten for the
//     entry's day.
//   - The pace badge falls back to the time per day the app wrote for the
//     entry's day, because the Plans it counts through today have moved on.
//
// Nothing was logged in the meantime: logging opens the app, which writes a
// new snapshot.

enum SnapshotDay {
  /// Gregorian in the device's time zone, like the JS day keys, whatever
  /// calendar the user has chosen.
  static var gregorian: Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .current
    return calendar
  }

  /// `YYYY-MM-DD` of `date`.
  static func key(_ date: Date, calendar: Calendar = gregorian) -> String {
    let parts = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
  }

  /// Entry dates from `now`: `now`, any of `extra` before the next midnight,
  /// and the next two midnights. Reload after the first midnight; the second
  /// covers a late reload.
  static func timeline(
    from now: Date, adding extra: [Date] = [], calendar: Calendar = gregorian
  ) -> (dates: [Date], reload: Date) {
    let midnight = nextDay(after: now, calendar: calendar)
    let following = nextDay(after: midnight, calendar: calendar)
    let between = Set(extra.filter { $0 > now && $0 < midnight }).sorted()
    return ([now] + between + [midnight, following], midnight)
  }

  /// When the day after `date`'s starts: midnight, or 1:00 where the clocks
  /// skip midnight that day. Where they repeat it, the first midnight.
  static func nextDay(after date: Date, calendar: Calendar = gregorian) -> Date {
    calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: date))
      .map(calendar.startOfDay) ?? date.addingTimeInterval(24 * 60 * 60)
  }

  /// `report`, built for the day `builtOn`, as of the day `today`.
  static func report(
    _ report: WidgetSnapshot.Report, builtOn: String, today: String
  ) -> WidgetSnapshot.Report {
    var report = report
    report.hoursPerDayToGoal = report.hoursPerDayToGoalByDay?[today]
    guard today > builtOn else { return report }
    if today.prefix(7) != builtOn.prefix(7) {
      // An empty month's label is already formatted for the user's setting.
      if report.monthMinutes != 0 { report.monthHoursFormatted = "0" }
      report.monthMinutes = 0
      report.progress = 0
      report.hasReportedThisMonth = false
      report.publisherState = .unreported
      report.monthConversationCount = 0
      report.monthBibleStudyCount = 0
    } else if report.publisherState == .reportedToday {
      report.publisherState = .reportedThisMonth
    }
    report.aheadBehindMinutes = nil
    return report
  }

  /// `calendar` with today, the past days and the current week as of `today`.
  static func calendar(_ calendar: WidgetSnapshot.Calendar, today: String) -> WidgetSnapshot.Calendar {
    guard !calendar.locked else { return calendar }
    var calendar = calendar
    for index in calendar.days.indices {
      calendar.days[index].isToday = calendar.days[index].date == today
      calendar.days[index].isPast = calendar.days[index].date <= today
    }
    if let index = calendar.days.firstIndex(where: { $0.date == today }) {
      calendar.currentWeekStart = index / 7 * 7
    } else if let last = calendar.days.last, today > last.date {
      calendar.currentWeekStart = max(calendar.days.count - 7, 0)
    }
    return calendar
  }

  /// Marks the follow-ups due before `date` overdue and puts them first, as
  /// `buildAppointments` does. `label` rewrites each time label.
  static func appointments(
    _ appointments: [WidgetSnapshot.Appointment], at date: Date, label: ((Date) -> String)? = nil
  ) -> [WidgetSnapshot.Appointment] {
    var appointments = appointments.map { appointment in
      var appointment = appointment
      appointment.isOverdue = appointment.isOverdue || appointment.dateAsDate < date
      if let label { appointment.timeFormatted = label(appointment.dateAsDate) }
      return appointment
    }
    appointments.sort { a, b in
      a.isOverdue != b.isOverdue ? a.isOverdue : a.date < b.date
    }
    return appointments
  }

  /// Mirrors `formatAppointmentTime` in `buildAppointments.ts`, except that a
  /// day before `now` gets its weekday or date rather than "Yesterday".
  static func appointmentLabel(
    _ date: Date, now: Date, tomorrowLabel: String, locale: Locale, calendar: Calendar = gregorian
  ) -> String {
    let formatter = DateFormatter()
    formatter.locale = locale
    formatter.calendar = calendar
    formatter.timeZone = calendar.timeZone
    formatter.dateStyle = .none
    formatter.timeStyle = .short
    let time = formatter.string(from: date)
    // Counted from noon to noon: a day that starts at 1:00, because the clocks
    // skip midnight, is less than a day before the next one starts.
    let noon: (Date) -> Date = {
      calendar.date(bySettingHour: 12, minute: 0, second: 0, of: $0) ?? $0
    }
    let days = calendar.dateComponents([.day], from: noon(now), to: noon(date)).day ?? 0
    if days == 0 { return time }
    if days == 1 { return "\(tomorrowLabel) \(time)" }
    var week = Calendar(identifier: .iso8601)
    week.timeZone = calendar.timeZone
    formatter.setLocalizedDateFormatFromTemplate(
      week.isDate(date, equalTo: now, toGranularity: .weekOfYear) ? "EEEjmm" : "MMMd")
    return formatter.string(from: date)
  }
}

extension WidgetSnapshot {
  /// The snapshot as of `date`; see `SnapshotDay`.
  func asOf(_ date: Date, calendar: Foundation.Calendar = SnapshotDay.gregorian) -> WidgetSnapshot {
    let today = SnapshotDay.key(date, calendar: calendar)
    let built = builtOn
      ?? SnapshotDay.key(Date(timeIntervalSince1970: updatedAt / 1000), calendar: calendar)
    var copy = self
    var reportDay = built
    var month = self.calendar
    if let next = nextMonth, today >= next.builtOn {
      copy.report = next.report
      reportDay = next.builtOn
      month = next.calendar
      if let phrase = next.report.encouragementPhrase {
        copy.strings.encouragementPhrase = phrase
      }
    }
    copy.report = SnapshotDay.report(copy.report, builtOn: reportDay, today: today)
    copy.calendar = SnapshotDay.calendar(month, today: today)
    let locale = Locale(identifier: self.locale)
    let tomorrow = strings.tomorrowLabel
    copy.appointments = SnapshotDay.appointments(
      appointments, at: date,
      label: today > built
        ? { SnapshotDay.appointmentLabel($0, now: date, tomorrowLabel: tomorrow, locale: locale, calendar: calendar) }
        : nil)
    return copy
  }
}
