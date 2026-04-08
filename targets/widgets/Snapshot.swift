import Foundation

// MARK: - Snapshot model
//
// Mirror of `WidgetSnapshot` defined in `src/lib/widgets/snapshot.ts`. Bump
// `SUPPORTED_VERSION` whenever the JS schema's `version` field changes in a
// way Swift cares about. The widget refuses to render snapshots whose version
// doesn't match — the placeholder UI is shown instead.

let SUPPORTED_VERSION = 4

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

  let version: Int
  let updatedAt: Double
  let locale: String
  let strings: Strings
  let config: Config
  let report: Report
  let contacts: [Contact]
  let appointments: [Appointment]
}
