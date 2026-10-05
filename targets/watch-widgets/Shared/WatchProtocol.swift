import Foundation

// Messages exchanged between the iPhone app and the Apple Watch app over
// WatchConnectivity.
//
// Canonical here and copied into the watch targets by
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

/// Which watch surface created a request. Reported to analytics on the iPhone.
public enum WatchOrigin: String, Codable, Sendable {
  case app
  case shortcut
  case timer
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
  }

  public let protocolVersion: Int
  public let kind: Kind
  /// Unique per request and reused on retry. Equals `entry.id` when there is
  /// an entry.
  public let id: String
  public let entry: WatchEntryDraft?
  public let timerAction: WatchTimerAction?
  /// For `saveTimer`: the timer revision the watch showed. The iPhone refuses
  /// the save if its timer changed since, so no unseen time is discarded.
  public let expectedTimerRevision: Int?
  public let origin: WatchOrigin?

  public init(
    kind: Kind, id: String = UUID().uuidString, entry: WatchEntryDraft? = nil,
    timerAction: WatchTimerAction? = nil, expectedTimerRevision: Int? = nil,
    origin: WatchOrigin? = nil
  ) {
    self.protocolVersion = WatchProtocol.version
    self.kind = kind
    self.id = id
    self.entry = entry
    self.timerAction = timerAction
    self.expectedTimerRevision = expectedTimerRevision
    self.origin = origin
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

/// What the watch shows, built by the iPhone app's JS (`src/app/watch`).
/// Display strings arrive translated into the app's language and durations
/// arrive formatted, so the watch never formats measured time itself.
public struct WatchSnapshot: Codable, Equatable, Sendable {
  public static let supportedVersion = 1

  public struct Category: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let name: String
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
  /// Single-token duration for complications, e.g. `12.5h`. Empty for zero.
  public let monthCompact: String
  /// Monthly goal the user set, in whole hours. 0 means no goal.
  public let goalHours: Int
  /// 0...1 toward the monthly goal.
  public let progress: Double
  /// `unreported`, `reportedToday` or `reportedThisMonth`.
  public let publisherState: String
  /// Ahead/behind or per-day pace line; `nil` when there's nothing to show.
  public let paceText: String?
  public let categories: [Category]
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
