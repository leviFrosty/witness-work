import AppIntents
import WidgetKit

// MARK: - Contacts widget config

enum ContactSortOption: String, AppEnum {
  case recent
  case alphabetical
  case bibleStudy

  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Sort"
  static var caseDisplayRepresentations: [Self: DisplayRepresentation] = [
    .recent: "Most Recent",
    .alphabetical: "Alphabetical",
    .bibleStudy: "Bible Studies",
  ]
}

struct ContactsConfigurationIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "Contacts Widget"
  static var description = IntentDescription("Pick how contacts are ordered.")

  @Parameter(title: "Sort by", default: .recent)
  var sort: ContactSortOption

  init() {}

  init(sort: ContactSortOption) {
    self.sort = sort
  }
}

// MARK: - Appointments widget config

enum AppointmentWindow: String, AppEnum {
  case oneDay
  case sevenDays
  case fourteenDays
  case thirtyDays

  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Window"
  static var caseDisplayRepresentations: [Self: DisplayRepresentation] = [
    .oneDay: "Today",
    .sevenDays: "Next 7 days",
    .fourteenDays: "Next 14 days",
    .thirtyDays: "Next 30 days",
  ]

  var days: Int {
    switch self {
    case .oneDay: return 1
    case .sevenDays: return 7
    case .fourteenDays: return 14
    case .thirtyDays: return 30
    }
  }
}

struct AppointmentsConfigurationIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "Appointments Widget"
  static var description = IntentDescription(
    "Pick how far ahead to look for upcoming follow-ups."
  )

  @Parameter(title: "Window", default: .sevenDays)
  var window: AppointmentWindow

  init() {}

  init(window: AppointmentWindow) {
    self.window = window
  }
}
