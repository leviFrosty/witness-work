import Foundation

// Messages exchanged between the iPhone app and the Apple Watch app over
// WatchConnectivity. The drafts and snapshot are also what Siri on the iPhone
// works with (`targets/intents`).
//
// Canonical here and copied into the watch and intents targets by
// `scripts/sync-widget-shared.mjs`. The iPhone is the source of truth: the
// watch sends `WatchRequest`s, and the iPhone answers with a `WatchReply` and
// publishes a `PhoneContext` describing everything the watch shows. Each
// message is JSON stored under `WatchProtocol.payloadKey` in the
// property-list dictionary WatchConnectivity transports.

public enum WatchProtocol {
  /// Bump when a change would break an older counterpart.
  public static let version = 1
  public static let payloadKey = "payload"

  public static func encode<T: Encodable>(_ value: T) throws -> [String: Any] {
    [payloadKey: try JSONEncoder().encode(value)]
  }

  public static func decode<T: Decodable>(
    _ type: T.Type, from dictionary: [String: Any]
  ) -> T? {
    guard let data = dictionary[payloadKey] as? Data else { return nil }
    return try? JSONDecoder().decode(type, from: data)
  }
}

/// Which surface created a request. Reported to analytics on the iPhone.
public enum WatchOrigin: String, Codable, Sendable {
  case app
  /// Siri or Shortcuts on the watch.
  case shortcut
  case timer
  /// Siri or Shortcuts on the iPhone or iPad, through `targets/intents`.
  case phoneShortcut
  /// The Up Next screen, opened from the app or its complication.
  case upNext = "up_next"
}

/// A Time Entry created on the watch. `id` becomes the Time Entry's id on the
/// iPhone, so a request delivered more than once adds the entry only once.
public struct WatchEntryDraft: Codable, Equatable, Sendable {
  public let id: String
  /// Gregorian `YYYY-MM-DD` of the watch's local day when the entry was made.
  /// Fixed at creation so a delivery after midnight still lands on that day.
  public let date: String
  public let hours: Int
  public let minutes: Int
  public let categoryId: String?
  public let origin: WatchOrigin

  public init(
    id: String, date: String, hours: Int, minutes: Int, categoryId: String?,
    origin: WatchOrigin
  ) {
    self.id = id
    self.date = date
    self.hours = hours
    self.minutes = minutes
    self.categoryId = categoryId
    self.origin = origin
  }
}

extension WatchEntryDraft {
  /// Minutes one entry can hold, matching the iPhone's validation.
  public static let minutesRange = 1..<(24 * 60)

  /// The timer's time as an entry: whole minutes, like the iPhone's Save Time.
  public static func timerMinutes(elapsedMs: Double) -> Int {
    Int(elapsedMs / 60_000)
  }
}

/// A mileage Trip made with Siri. `id` becomes the Trip's id on the iPhone, so
/// a request delivered more than once adds the trip only once.
public struct WatchTripDraft: Codable, Equatable, Sendable {
  public let id: String
  /// Gregorian `YYYY-MM-DD` of the local day when the trip was logged.
  public let date: String
  /// `nil` uses the car the iPhone app picks for a new trip.
  public let vehicleId: String?
  /// Total distance in miles, already doubled for a round trip.
  public let distanceMiles: Double
  public let roundTrip: Bool
  public let origin: WatchOrigin

  public init(
    id: String, date: String, vehicleId: String?, distanceMiles: Double, roundTrip: Bool,
    origin: WatchOrigin
  ) {
    self.id = id
    self.date = date
    self.vehicleId = vehicleId
    self.distanceMiles = distanceMiles
    self.roundTrip = roundTrip
    self.origin = origin
  }
}

public enum WatchTimerAction: String, Codable, Sendable {
  case start
  case pause
}

/// Watch → iPhone.
public struct WatchRequest: Codable, Sendable, Identifiable {
  public enum Kind: String, Codable, Sendable {
    /// Ask for a fresh `PhoneContext`.
    case hello
    case addEntry
    case timer
    /// Add the timer's time as an entry and reset the timer.
    case saveTimer
    /// Pause the timer, add its whole minutes as an entry and reset it. Unlike
    /// `saveTimer`, this saves whatever the timer holds when the iPhone
    /// handles it; `entry` gives the id, day and Type, and its time is ignored.
    case stopTimer
    case addTrip
  }

  public let protocolVersion: Int
  public let kind: Kind
  /// Unique per request and reused on retry. Equals `entry.id` or `trip.id`
  /// when there is one.
  public let id: String
  public let entry: WatchEntryDraft?
  public let trip: WatchTripDraft?
  public let timerAction: WatchTimerAction?
  /// For `saveTimer`: the timer revision the watch showed. The iPhone refuses
  /// the save if its timer changed since, so no unseen time is discarded.
  public let expectedTimerRevision: Int?
  public let origin: WatchOrigin?
  /// For `hello`: widget kinds of the complications in use, for analytics.
  public let complications: [String]?

  public init(
    kind: Kind, id: String = UUID().uuidString, entry: WatchEntryDraft? = nil,
    trip: WatchTripDraft? = nil, timerAction: WatchTimerAction? = nil,
    expectedTimerRevision: Int? = nil, origin: WatchOrigin? = nil,
    complications: [String]? = nil
  ) {
    self.protocolVersion = WatchProtocol.version
    self.kind = kind
    self.id = id
    self.entry = entry
    self.trip = trip
    self.timerAction = timerAction
    self.expectedTimerRevision = expectedTimerRevision
    self.origin = origin
    self.complications = complications
  }
}

/// iPhone → watch, in answer to a `WatchRequest` sent as a message.
public struct WatchReply: Codable, Sendable {
  public enum Status: String, Codable, Sendable {
    /// Durably received. An entry is saved once the iPhone app processes it;
    /// the watch learns that from `PhoneContext.resolvedEntryIds`.
    case accepted
    case rejected
  }

  public enum Reason: String, Codable, Sendable {
    case timerChanged
    /// `stopTimer` found less than a minute on the timer.
    case timerEmpty
    /// `stopTimer` found 24 hours or more, longer than any entry.
    case timerTooLong
    case unsupportedVersion
    case invalid
    /// The iPhone couldn't store the request (e.g. locked after a restart).
    case unavailable
  }

  public let status: Status
  public let reason: Reason?
  public let context: PhoneContext?

  public init(status: Status, reason: Reason? = nil, context: PhoneContext?) {
    self.status = status
    self.reason = reason
    self.context = context
  }
}

/// The iPhone's service timer, mirrored from `StopwatchStore`.
public struct TimerSnapshot: Codable, Equatable, Sendable {
  public let isRunning: Bool
  /// Unix seconds when the running segment started; `nil` while paused.
  public let startedAt: Double?
  public let accumulatedMs: Double
  /// Advances on every change to the iPhone's timer.
  public let revision: Int

  public init(isRunning: Bool, startedAt: Double?, accumulatedMs: Double, revision: Int) {
    self.isRunning = isRunning
    self.startedAt = startedAt
    self.accumulatedMs = accumulatedMs
    self.revision = revision
  }

  public func elapsedMs(now: Date = Date()) -> Double {
    if isRunning, let startedAt {
      return accumulatedMs + max(0, (now.timeIntervalSince1970 - startedAt) * 1000)
    }
    return accumulatedMs
  }

  /// The date a counting-up `Text(timerInterval:)` starts from.
  public func effectiveStartDate(now: Date = Date()) -> Date {
    now.addingTimeInterval(-elapsedMs(now: now) / 1000)
  }
}

/// A Follow-up or Plan for Up Next, built by `src/app/watch/buildUpNext.ts`.
/// Times arrive formatted in the app's time format; the watch only picks which
/// label fits the day it's showing.
public struct UpNextItem: Codable, Equatable, Sendable, Identifiable {
  public enum Kind: String, Codable, Sendable {
    case followUp
    case plan
  }

  /// Where Directions go.
  public struct Place: Codable, Equatable, Sendable {
    public let name: String?
    /// Searchable address, used when there's no coordinate.
    public let address: String?
    public let latitude: Double?
    public let longitude: Double?
  }

  /// Visit id, Day Plan id, or `<Recurring Plan id>:<YYYY-MM-DD>`.
  public let id: String
  public let kind: Kind
  /// Epoch ms of the start; local midnight of its day when not `timed`.
  public let start: Double
  /// False for a Plan without a start time, which spans its day.
  public let timed: Bool
  /// The Contact's name, or the Plan's title or Type.
  public let title: String
  /// The Follow-up's topic or street, or the Plan's place.
  public let detail: String?
  /// Planned duration, compact (`2h`). Plans only.
  public let durationText: String?
  /// E.g. `3:00 PM`; `nil` when not `timed`.
  public let timeText: String?
  /// `timeText` without its AM/PM marker, e.g. `3:00`.
  public let clockText: String?
  /// The AM/PM marker of 12-hour time, e.g. `PM`.
  public let periodText: String?
  /// E.g. `Thu`.
  public let weekdayText: String
  /// E.g. `Oct 14`.
  public let dateText: String
  public let place: Place?

  public var startDate: Date { Date(timeIntervalSince1970: start / 1000) }
}

/// What the watch shows, built by the iPhone app's JS (`src/app/watch`).
/// Display strings arrive translated into the app's language and durations
/// arrive formatted. The watch formats measured time only to add its own
/// unsynced entries to the month's total (`MonthProgress`).
///
/// Fields added after version 1 are optional, so a snapshot stored by an
/// older iPhone app still decodes.
public struct WatchSnapshot: Codable, Equatable, Sendable {
  public static let supportedVersion = 1

  public struct Category: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let isCredit: Bool?
  }

  public struct NextMonth: Codable, Equatable, Sendable {
    public let monthKey: String
    public let monthName: String
    public let goalHours: Int
    public let showsTimeEntry: Bool
  }

  /// What Siri needs to log a trip.
  public struct Mileage: Codable, Equatable, Sendable {
    public struct Vehicle: Codable, Equatable, Sendable, Identifiable {
      public let id: String
      public let name: String
    }

    /// Mileage Tracking isn't turned off.
    public let enabled: Bool
    /// `mi` or `km`: what a spoken distance means.
    public let distanceUnit: String
    /// Cars that aren't archived, the one a new trip uses first.
    public let vehicles: [Vehicle]
  }

  public let version: Int
  /// Epoch ms.
  public let generatedAt: Double
  /// `YYYY-MM` of the iPhone's month when built. The watch treats progress for
  /// another month as stale.
  public let monthKey: String
  /// Add Time and the timer are available (hours-mode role or Hours Logging).
  public let showsTimeEntry: Bool
  /// `hours` or `checkbox` — the Service Report format of this month's role.
  public let entryMode: String
  public let monthFormatted: String
  /// Single-token duration for complications, e.g. `12.5h`; `0h` for zero.
  public let monthCompact: String
  /// Credit-capped minutes this month.
  public let monthMinutes: Int?
  /// Localized name of the month, e.g. `October`.
  public let monthName: String?
  /// Monthly goal the user set, in whole hours. 0 means no goal.
  public let goalHours: Int
  /// 0...1 toward the monthly goal.
  public let progress: Double
  /// Planned minutes through each day of the month (index 0 is the 1st);
  /// `nil` when the month has no plans.
  public let plannedThroughDay: [Int]?
  /// `unreported`, `reportedToday` or `reportedThisMonth`.
  public let publisherState: String
  /// Ahead/behind or per-day pace line; `nil` when there's nothing to show.
  public let paceText: String?
  /// So the watch can start next month at zero before the iPhone syncs.
  public let nextMonth: NextMonth?
  /// Watch entries this snapshot already counts although the iPhone hasn't
  /// reported them resolved yet, so the watch doesn't count them twice.
  public let reflectedEntryIds: [String]?
  public let upNext: [UpNextItem]?
  public let categories: [Category]
  /// `nil` from an iPhone app older than Siri trip logging.
  public let mileage: Mileage?
  public let strings: [String: String]
}

/// iPhone → watch: published as the application context, and returned with
/// every reply.
public struct PhoneContext: Codable, Sendable {
  public let protocolVersion: Int
  /// Unix seconds. Also makes each published context distinct.
  public let sentAt: Double
  /// `nil` until the iPhone app has run since the watch app was installed.
  public let snapshot: WatchSnapshot?
  public let timer: TimerSnapshot
  /// Watch entry ids the iPhone app has finished with (saved or refused),
  /// oldest first.
  public let resolvedEntryIds: [String]

  public init(
    sentAt: Double, snapshot: WatchSnapshot?, timer: TimerSnapshot,
    resolvedEntryIds: [String]
  ) {
    self.protocolVersion = WatchProtocol.version
    self.sentAt = sentAt
    self.snapshot = snapshot
    self.timer = timer
    self.resolvedEntryIds = resolvedEntryIds
  }
}
