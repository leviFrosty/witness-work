import Foundation

// MARK: - Snapshot model
//
// Mirror of `WidgetSnapshot` defined in `src/lib/widgets/snapshot.ts`. Bump
// `SUPPORTED_VERSION` whenever the JS schema's `version` field changes in a
// way Swift cares about. The widget refuses to render snapshots whose version
// doesn't match — the placeholder UI is shown instead.

let SUPPORTED_VERSION = 2

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
    let todayLabel: String
    let tomorrowLabel: String
  }

  // MARK: Report card
  enum ReportMode: String, Decodable {
    case hours
    case checkbox
  }

  struct Report: Decodable {
    let mode: ReportMode
    let monthMinutes: Int
    let monthHoursFormatted: String
    let goalHours: Int
    let progress: Double
    /// `nil` when the value would be misleading (≤ 0 hours, no remaining work).
    let hoursPerDayNeeded: Double?
    /// Minutes ahead (+) or behind (−) of plan. `nil` when no plan exists.
    let aheadBehindMinutes: Int?
    let hasReportedThisMonth: Bool
  }

  // MARK: Contacts
  struct Contact: Decodable, Identifiable {
    let id: String
    let name: String
    let phone: String?
    let telUrl: String?
    let smsUrl: String?
    let mapsUrl: String?
    /// Epoch ms; `nil` if the contact has no conversation history.
    let lastConversationAt: Double?
    let isBibleStudy: Bool
  }

  // MARK: Appointments
  struct Appointment: Decodable, Identifiable {
    let id: String
    let contactId: String
    let contactName: String
    /// Epoch ms of the follow-up date.
    let date: Double
    let topic: String?
    let isBibleStudy: Bool

    var dateAsDate: Date {
      Date(timeIntervalSince1970: date / 1000)
    }
  }

  let version: Int
  let updatedAt: Double
  let locale: String
  let strings: Strings
  let report: Report
  let contacts: [Contact]
  let appointments: [Appointment]
}
