import Foundation

// MARK: - Snapshot model
//
// Mirror of `WidgetSnapshot` defined in `src/app/widgets/snapshot.ts`. Bump
// `SUPPORTED_VERSION` whenever the JS schema's `version` field changes in a
// way Swift cares about. The widget refuses to render snapshots whose version
// doesn't match — the placeholder UI is shown instead.

let SUPPORTED_VERSION = 6

struct WidgetSnapshot: Decodable {
  // MARK: Strings (pre-translated by JS)
  struct Strings: Decodable {
    // Report
    let monthHoursLabel: String
    let goalLabel: String
    let addTimeLabel: String
    let sharedGoodNewsLabel: String
    let hoursPerDayToGoalSuffix: String
    let aheadOfScheduleLabel: String
    let behindScheduleLabel: String
    let encouragementPhrase: String
    let monthLabel: String
    let reportedTodayLabel: String
    let conversationsThisMonthLabel: String
    let studiesThisMonthLabel: String

    // Contacts
    let contactsLabel: String
    let noContactsLabel: String
    let callLabel: String
    let textLabel: String
    let directionsLabel: String

    // Appointments
    let appointmentsLabel: String
    let todaysConversationsLabel: String
    let upcomingConversationsLabel: String
    let noAppointmentsLabel: String
    let tomorrowLabel: String
    let overdueLabel: String
    let rescheduleLabel: String
    let markCompleteLabel: String

    // Calendar
    let calendarLabel: String
    let calendarPublisherLockedLabel: String
    let createPlanLabel: String

    // Added after version 6, so `nil` from an older app; see `L10n` for the
    // bundled fallback.
    /// Under the checkbox of the circular lock screen widget.
    let reportLabel: String?
    /// The Live Activity's label.
    let timerLabel: String?
    /// The Pet widget's text while there's no pet.
    let petPlaceholderLabel: String?
  }

  // MARK: Config (Settings > Widgets — source of truth)
  enum ContactSort: String, Decodable {
    case longestContacted
    case recentConversation
    case az
    case bibleStudy
  }

  enum ContactAction: String, Decodable {
    case directions
    case call
    case text
    case none
  }

  enum AppointmentWindow: String, Decodable {
    case today
    case sevenDays = "7days"
    case fourteenDays = "14days"
    case thirtyDays = "30days"
  }

  struct Config: Decodable {
    let contactSort: ContactSort
    let contactAction: ContactAction
    let appointmentWindow: AppointmentWindow
  }

  // MARK: Report card
  enum ReportMode: String, Decodable {
    case hours
    case checkbox
  }

  enum PublisherState: String, Decodable {
    case unreported
    case reportedToday
    case reportedThisMonth
  }

  struct Report: Decodable {
    let mode: ReportMode

    // Month
    let monthMinutes: Int
    let monthHoursFormatted: String
    let goalHours: Int
    let progress: Double
    /// `nil` when the value would be misleading (≤ 0 hours, no remaining work).
    let hoursPerDayNeeded: Double?
    /// Minutes ahead (+) or behind (−) of plan. `nil` when no plan exists.
    let aheadBehindMinutes: Int?

    // Publisher (checkbox) mode
    let hasReportedThisMonth: Bool
    let publisherState: PublisherState
    let monthConversationCount: Int
    let monthBibleStudyCount: Int
  }

  // MARK: Contacts
  enum ContactStaleness: String, Decodable {
    case never
    case recent
    case week
    case month
  }

  struct Contact: Decodable, Identifiable {
    let id: String
    let name: String
    let phone: String?
    let telUrl: String?
    let smsUrl: String?
    let mapsUrl: String?
    /// Epoch ms; `nil` if the contact has no conversation history.
    let lastConversationAt: Double?
    /// Pre-translated relative time string (e.g. "3 days ago").
    let lastContactedRelative: String?
    let isBibleStudy: Bool
    let isFavorite: Bool
    let staleness: ContactStaleness
  }

  // MARK: Appointments
  struct Appointment: Decodable, Identifiable {
    let id: String
    let contactId: String
    let contactName: String
    /// Epoch ms of the follow-up date.
    let date: Double
    let topic: String?
    /// Pre-formatted, locale-aware time-of-day string from JS.
    let timeFormatted: String
    let isOverdue: Bool

    var dateAsDate: Date {
      Date(timeIntervalSince1970: date / 1000)
    }
  }

  // MARK: Calendar
  struct CalendarDay: Decodable, Identifiable {
    /// ISO `YYYY-MM-DD` used as both the deep-link parameter and the list id.
    let date: String
    let day: Int
    let isCurrentMonth: Bool
    let isToday: Bool
    let isPast: Bool
    let wentInService: Bool
    let hasPlan: Bool
    /// Pre-formatted compact planned hours (e.g. `"1.5h"`). Empty when no plan.
    let plannedText: String
    let workedMinutes: Int
    let hitGoal: Bool
    let hasNote: Bool
    /// Buddy badge for the day; `nil` when there's nothing to show.
    let buddies: DayBuddies?

    var id: String { date }
  }

  /// Mirrors `BuddyDayBadge`'s inputs for one day.
  struct DayBuddies: Decodable {
    /// Ids into `Calendar.buddies`, stacked up the cell's right edge from the
    /// corner. At most three.
    let withIds: [String]
    /// Buddies left out of `withIds`, counted in a "+N" circle atop the stack.
    let more: Int
    /// Other buddies plan to go out; a dot when `withIds` is empty.
    let goingOut: Bool
    /// Pre-translated VoiceOver label naming the buddies.
    let label: String
  }

  /// A buddy drawn on the calendar: photo, else emoji, else initial.
  struct CalendarBuddy: Decodable, Identifiable {
    let id: String
    let initial: String
    let emoji: String?
    /// Base64 JPEG thumbnail.
    let image: String?
  }

  struct Calendar: Decodable {
    /// True for publishers — the widget renders a locked placeholder.
    let locked: Bool
    let month: Int
    let year: Int
    let startOfWeek: Int
    let weekdayLabels: [String]
    let monthTitle: String
    /// Always 42 cells (6 weeks) when `locked == false`, empty otherwise.
    let days: [CalendarDay]
    /// Index into `days` where the current week starts. Used by the medium
    /// widget to slice out a single row without re-deriving dates.
    let currentWeekStart: Int
    /// Every buddy referenced by a day's `buddies.withIds`.
    let buddies: [CalendarBuddy]
  }

  // MARK: Pet
  //
  // Mirrors `PetWidgetSnapshot` in `src/app/widgets/petWidget.ts`. The images
  // are PNGs the app writes into the App Group's `pet/` folder.

  /// What the widget's text says during one entry.
  struct PetEntryStatus: Decodable {
    /// Lamp brightness, 0 to 5.
    let lampLevel: Int
    /// Pre-translated, e.g. "12 days kept". `nil` when streaks are hidden.
    let lampDaysLabel: String?
    /// Pre-translated one-liner of the wall sign.
    let signLine: String?
    /// Pre-translated VoiceOver label for the pet and its hearts.
    let accessibilityLabel: String
  }

  /// One future state of the pet, shown from `date` on.
  struct PetEntry: Decodable {
    /// Epoch ms.
    let date: Double
    /// File names in `pet/`: square crops of the pet for small and medium,
    /// the 123:100 room for large.
    let small: String
    let medium: String
    let large: String
    /// 0 to 5 in steps of 0.5.
    let hearts: Double
    let dead: Bool
    let gold: Bool
    /// The lamp and sign as of `date`. `nil` from an older app; the pet's
    /// own fields stand in.
    let status: PetEntryStatus?

    var dateAsDate: Date {
      Date(timeIntervalSince1970: date / 1000)
    }
  }

  struct Pet: Decodable {
    /// The pet's name, or its localized species name.
    let name: String
    /// The current entry's text, for an entry without `status`. Pre-translated
    /// VoiceOver label for the pet and its hearts.
    let accessibilityLabel: String
    let hearts: Double
    let dead: Bool
    let gold: Bool
    /// Lamp brightness, 0 to 5.
    let lampLevel: Int
    /// Pre-translated, e.g. "12 days kept". `nil` when streaks are hidden.
    let lampDaysLabel: String?
    /// Pre-translated one-liner of the wall sign, e.g. "14.5 of 30 hours".
    let signLine: String?
    /// Oldest first; the first may be in the past.
    let entries: [PetEntry]
  }

  /// The `pet` slice, or `nil` inside when it can't be read, so a malformed
  /// one never fails the snapshot every other widget decodes.
  struct LenientPet: Decodable {
    let value: Pet?

    init(from decoder: Decoder) throws {
      value = try? Pet(from: decoder)
    }
  }

  let version: Int
  let updatedAt: Double
  let locale: String
  /// The app lays out right to left (its Language, or the dev switch). `nil`
  /// from an app older than right-to-left support.
  let rtl: Bool?
  /// BCP 47 tag the app writes numbers in, e.g. `ar-u-nu-arab` for
  /// Arabic-Indic digits. `nil` from an older app.
  let numberLocale: String?
  /// Supporter-only hex (`#RRGGBB`). `nil` means fall back to the brand green.
  /// JS already gates this on supporter status, so Swift just trusts the field.
  let accentColor: String?
  let strings: Strings
  let config: Config
  let report: Report
  let contacts: [Contact]
  let appointments: [Appointment]
  let calendar: Calendar
  /// Added after version 6: `nil` from an older app and when there's no pet.
  /// Read leniently (`pet?.value`).
  let pet: LenientPet?
}

extension WidgetSnapshot {
  /// Direction and digits in the app's Language (`AppLanguage`).
  var appLanguage: AppLanguage { AppLanguage(rtl: rtl, numberLocale: numberLocale) }
}
