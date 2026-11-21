import ActivityKit
import Foundation

// Mirrored into the main app's expo module via `StopwatchBridge.podspec`
// source_files glob. Same file compiled into both the widget extension and the
// host app target — ActivityKit requires the `ActivityAttributes` type to be
// identical on both sides.

@available(iOS 16.1, *)
public struct StopwatchAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// Unix seconds (Double) when the currently-running segment started.
    /// `nil` whenever `isRunning == false`.
    public let startedAt: Double?

    /// Milliseconds accumulated from previous start/pause segments.
    public let accumulatedMs: Double

    public let isRunning: Bool

    /// Unix seconds of the last state mutation. Used for cache-busting.
    public let updatedAt: Double

    public init(
      startedAt: Double?,
      accumulatedMs: Double,
      isRunning: Bool,
      updatedAt: Double
    ) {
      self.startedAt = startedAt
      self.accumulatedMs = accumulatedMs
      self.isRunning = isRunning
      self.updatedAt = updatedAt
    }

    /// When running, returns the `Date` the widget should pass to
    /// `Text(timerInterval:)` so the OS auto-animates seconds without needing
    /// push updates. Effective start = now − elapsedMs.
    public func effectiveStartDate(now: Date = Date()) -> Date? {
      guard isRunning, let startedAt else { return nil }
      let currentSegment = now.timeIntervalSince1970 - startedAt
      let totalMs = accumulatedMs + currentSegment * 1000
      return now.addingTimeInterval(-totalMs / 1000)
    }

    /// From this many seconds the time shows an hours field: `1:00:00`.
    public static let hoursFieldSeconds: Double = 3600

    /// How long before the hour the Dynamic Island makes room for the hours
    /// field. iOS marks an Activity stale no sooner than two minutes after its
    /// last update, so a stopwatch resumed at 59:30 is laid out again only at
    /// 1:01:30; widening this early leaves no moment it doesn't fit.
    public static let hoursFieldLeadSeconds: Double = 120

    /// Whether the Dynamic Island's time is laid out wide enough for an hours
    /// field, and for a second digit of hours from nine hours on.
    public func roomForHours(now: Date = Date()) -> (hours: Bool, tensOfHours: Bool) {
      let elapsed = elapsedMs(now: now) / 1000 + Self.hoursFieldLeadSeconds
      return (elapsed >= Self.hoursFieldSeconds, elapsed >= Self.hoursFieldSeconds * 10)
    }

    /// When a running stopwatch needs room for the hours field. The Activity
    /// goes stale then, so the system lays it out again at the new width.
    /// `nil` when paused or once there's room.
    public func hoursFieldDate(now: Date = Date()) -> Date? {
      guard isRunning else { return nil }
      let remaining = Self.hoursFieldSeconds - Self.hoursFieldLeadSeconds
        - elapsedMs(now: now) / 1000
      return remaining > 0 ? now.addingTimeInterval(remaining) : nil
    }

    /// Total elapsed ms — used for paused-state display.
    public func elapsedMs(now: Date = Date()) -> Double {
      if isRunning, let startedAt {
        return accumulatedMs + max(0, (now.timeIntervalSince1970 - startedAt) * 1000)
      }
      return accumulatedMs
    }
  }

  public init() {}
}
