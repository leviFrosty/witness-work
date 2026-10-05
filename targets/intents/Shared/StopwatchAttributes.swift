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
