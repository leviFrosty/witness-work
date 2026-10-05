import AppIntents
import Foundation

// Siri and Shortcuts actions, the same on the iPhone (this extension) and the
// Apple Watch. Canonical here and copied into `targets/watch/Shared` by
// `scripts/sync-widget-shared.mjs`.
//
// Each target implements `ServiceActions`: the watch asks the iPhone over
// WatchConnectivity, and the iPhone extension changes the timer itself and
// leaves entries and trips for the app to save (`IntentInbox`). Intents often
// run in the background with no UI. Titles and dialogs are keys in each
// target's string catalog, generated from `src/locales`.

/// Why an action couldn't finish. Spoken by Siri, and shown in the watch app.
enum ServiceActionError: Error, CustomLocalizedStringResourceConvertible {
  case notSetUp
  case hoursLoggingOff
  case invalidDuration
  case timerEmpty
  case timerTooLong
  case mileageOff
  case noCar
  case invalidDistance
  case phoneUnreachable
  case timerChanged
  case failed

  /// Translation key.
  var key: String {
    switch self {
    #if os(watchOS)
    case .notSetUp: return "watchSetUp"
    case .hoursLoggingOff: return "watchHoursLoggingOff"
    #else
    case .notSetUp: return "siriSetUp"
    case .hoursLoggingOff: return "siriHoursLoggingOff"
    #endif
    case .invalidDuration: return "siriInvalidDuration"
    case .timerEmpty: return "siriTimerEmpty"
    case .timerTooLong: return "siriTimerTooLong"
    case .mileageOff: return "siriMileageOff"
    case .noCar: return "siriNoCar"
    case .invalidDistance: return "siriInvalidDistance"
    case .phoneUnreachable: return "watchPhoneUnreachable"
    case .timerChanged: return "watchTimerChanged"
    case .failed: return "requestFailedTryAgain"
    }
  }

  /// For analytics.
  var reason: String {
    switch self {
    case .notSetUp: "not_set_up"
    case .hoursLoggingOff: "hours_logging_off"
    case .invalidDuration: "invalid_duration"
    case .timerEmpty: "timer_empty"
    case .timerTooLong: "timer_too_long"
    case .mileageOff: "mileage_off"
    case .noCar: "no_car"
    case .invalidDistance: "invalid_distance"
    case .phoneUnreachable: "phone_unreachable"
    case .timerChanged: "timer_changed"
    case .failed: "failed"
    }
  }

  var localizedStringResource: LocalizedStringResource {
    LocalizedStringResource(String.LocalizationValue(key))
  }
}

/// Reported to analytics.
enum ServiceAction: String {
  case addTime = "add_time"
  case startTimer = "start_timer"
  case pauseTimer = "pause_timer"
  case stopTimer = "stop_timer"
  case logTrip = "log_trip"
}

extension ServiceActions {
  /// Runs `body` and records how it went.
  @MainActor
  static func run(_ action: ServiceAction, _ body: () async throws -> Void) async throws {
    do {
      try await body()
      record(action, error: nil)
    } catch let error as ServiceActionError {
      record(action, error: error)
      throw error
    }
  }

  /// The snapshot, when Add Time and the timer are available.
  @MainActor
  static func timeEntrySnapshot() async throws -> WatchSnapshot {
    guard let snapshot = await snapshot() else { throw ServiceActionError.notSetUp }
    guard snapshot.showsTimeEntry else { throw ServiceActionError.hoursLoggingOff }
    return snapshot
  }

  /// The chosen Type, unless it was deleted since.
  static func categoryId(_ category: ServiceCategoryEntity?, in snapshot: WatchSnapshot) -> String? {
    guard let category else { return nil }
    return snapshot.categories.contains { $0.id == category.id } ? category.id : nil
  }
}

// MARK: Time

struct AddServiceTimeIntent: AppIntent {
  static let title: LocalizedStringResource = "siriAddServiceTime"

  @Parameter(title: "siriDuration", defaultUnit: .minutes, supportsNegativeNumbers: false)
  var duration: Measurement<UnitDuration>

  @Parameter(title: "type")
  var category: ServiceCategoryEntity?

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    try await ServiceActions.run(.addTime) {
      let total = Int(duration.converted(to: .minutes).value.rounded())
      guard WatchEntryDraft.minutesRange.contains(total) else {
        throw ServiceActionError.invalidDuration
      }
      let snapshot = try await ServiceActions.timeEntrySnapshot()
      try await ServiceActions.addEntry(
        minutes: total, categoryId: ServiceActions.categoryId(category, in: snapshot))
    }
    return .result(dialog: IntentDialog("timeAdded"))
  }
}

struct StartServiceTimerIntent: AppIntent {
  static let title: LocalizedStringResource = "siriStartServiceTimer"

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    try await ServiceActions.run(.startTimer) {
      _ = try await ServiceActions.timeEntrySnapshot()
      try await ServiceActions.setTimer(.start)
    }
    return .result(dialog: IntentDialog("siriTimerStarted"))
  }
}

struct PauseServiceTimerIntent: AppIntent {
  static let title: LocalizedStringResource = "siriPauseServiceTimer"

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    try await ServiceActions.run(.pauseTimer) {
      _ = try await ServiceActions.timeEntrySnapshot()
      try await ServiceActions.setTimer(.pause)
    }
    return .result(dialog: IntentDialog("siriTimerPaused"))
  }
}

/// Saves the timer's whole minutes as an entry for today and resets it.
struct StopServiceTimerIntent: AppIntent {
  static let title: LocalizedStringResource = "siriStopServiceTimer"

  @Parameter(title: "type")
  var category: ServiceCategoryEntity?

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    try await ServiceActions.run(.stopTimer) {
      let snapshot = try await ServiceActions.timeEntrySnapshot()
      try await ServiceActions.stopTimer(
        categoryId: ServiceActions.categoryId(category, in: snapshot))
    }
    return .result(dialog: IntentDialog("siriTimerSaved"))
  }
}

// MARK: Mileage

struct LogTripIntent: AppIntent {
  static let title: LocalizedStringResource = "siriLogTrip"

  /// In the user's distance unit.
  @Parameter(title: "mileage.distance")
  var distance: Double?

  @Parameter(title: "mileage.car")
  var car: ServiceVehicleEntity?

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    try await ServiceActions.logTrip(distance: $distance, car: car, roundTrip: false)
    return .result(dialog: IntentDialog("siriTripLogged"))
  }
}

/// Its own action rather than a preset of `LogTripIntent`, so Siri always
/// asks for the one-way distance and doubles it.
struct LogRoundTripIntent: AppIntent {
  static let title: LocalizedStringResource = "siriLogRoundTripShort"

  /// One way, in the user's distance unit.
  @Parameter(title: "mileage.distance")
  var distance: Double?

  @Parameter(title: "mileage.car")
  var car: ServiceVehicleEntity?

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    try await ServiceActions.logTrip(distance: $distance, car: car, roundTrip: true)
    return .result(dialog: IntentDialog("siriTripLogged"))
  }
}

extension ServiceActions {
  private static let kilometersPerMile = 1.609344
  /// Matches the trip form's input length.
  private static let maxDistance = 100_000.0

  /// Asks for the distance if it's missing, in the user's unit.
  @MainActor
  static func logTrip(
    distance: IntentParameter<Double?>, car: ServiceVehicleEntity?, roundTrip: Bool
  ) async throws {
    try await run(.logTrip) {
      guard let snapshot = await snapshot() else { throw ServiceActionError.notSetUp }
      // From an iPhone app older than this action, as if there were no car.
      guard let mileage = snapshot.mileage else { throw ServiceActionError.noCar }
      guard mileage.enabled else { throw ServiceActionError.mileageOff }
      let chosen = car.flatMap { car in mileage.vehicles.first { $0.id == car.id } }
      guard let vehicle = chosen ?? mileage.vehicles.first else {
        throw ServiceActionError.noCar
      }

      let kilometers = mileage.distanceUnit == "km"
      var answer = distance.wrappedValue
      if answer == nil {
        let prompt =
          roundTrip
          ? (kilometers ? "siriOneWayPromptKm" : "siriOneWayPromptMi")
          : (kilometers ? "siriDistancePromptKm" : "siriDistancePromptMi")
        answer = try await distance.requestValue(
          IntentDialog(LocalizedStringResource(String.LocalizationValue(prompt))))
      }
      guard let value = answer, value > 0, value < maxDistance else {
        throw ServiceActionError.invalidDistance
      }
      let miles = kilometers ? value / kilometersPerMile : value
      try await addTrip(
        vehicleId: vehicle.id, distanceMiles: roundTrip ? miles * 2 : miles,
        roundTrip: roundTrip)
    }
  }
}

// MARK: Entities

/// A Category, called a Type in the app.
struct ServiceCategoryEntity: AppEntity {
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "type"
  static let defaultQuery = ServiceCategoryQuery()

  let id: String
  let name: String

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)")
  }
}

struct ServiceCategoryQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [ServiceCategoryEntity] {
    all().filter { identifiers.contains($0.id) }
  }

  func suggestedEntities() async throws -> [ServiceCategoryEntity] {
    all()
  }

  private func all() -> [ServiceCategoryEntity] {
    (ServiceActions.storedSnapshot()?.categories ?? []).map {
      ServiceCategoryEntity(id: $0.id, name: $0.name)
    }
  }
}

struct ServiceVehicleEntity: AppEntity {
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "mileage.car"
  static let defaultQuery = ServiceVehicleQuery()

  let id: String
  let name: String

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)")
  }
}

struct ServiceVehicleQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [ServiceVehicleEntity] {
    all().filter { identifiers.contains($0.id) }
  }

  func suggestedEntities() async throws -> [ServiceVehicleEntity] {
    all()
  }

  private func all() -> [ServiceVehicleEntity] {
    (ServiceActions.storedSnapshot()?.mileage?.vehicles ?? []).map {
      ServiceVehicleEntity(id: $0.id, name: $0.name)
    }
  }
}
