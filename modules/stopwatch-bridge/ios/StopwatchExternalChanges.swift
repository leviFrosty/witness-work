import Foundation
import UIKit

/// Brings the app up to date with stopwatch changes another process saved:
/// Siri on the iPhone (`targets/intents`) or a Live Activity button.
///
/// Such a change is reposted here as `StopwatchStore.didChangeNotification`,
/// so JS and the watch update. The Live Activity is brought in line too, since
/// an extension can't start one; that waits until the app is active. Changes
/// arrive by Darwin notification while the app runs, and are caught up on
/// whenever it becomes active.
///
/// App-only: unlike the other stopwatch files, not copied into the targets.
@available(iOS 16.1, *)
public enum StopwatchExternalChanges {
  private static let lock = NSLock()
  private static var started = false
  /// `commandCounter` as of the last change this process saved or reposted.
  private static var seenCounter = 0
  /// A change arrived while the app was in the background.
  private static var liveActivityNeedsSync = false
  private static var observers: [NSObjectProtocol] = []

  /// Idempotent.
  public static func start() {
    let isFirst = lock.withLock { () -> Bool in
      defer { started = true }
      if !started { seenCounter = StopwatchStore.commandCounter }
      return !started
    }
    guard isFirst else { return }

    let center = NotificationCenter.default
    // Saves in this process post synchronously, before their Darwin
    // notification arrives, so they're never mistaken for outside changes.
    observers.append(
      center.addObserver(
        forName: StopwatchStore.didChangeNotification, object: nil, queue: nil
      ) { _ in
        lock.withLock { seenCounter = StopwatchStore.commandCounter }
      })
    observers.append(
      center.addObserver(
        forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
      ) { _ in
        check()
        if liveActivityNeedsSync { syncLiveActivity() }
      })
    if let name = StopwatchStore.changedElsewhereNotificationName {
      CFNotificationCenterAddObserver(
        CFNotificationCenterGetDarwinNotifyCenter(), nil,
        { _, _, _, _, _ in
          DispatchQueue.main.async { StopwatchExternalChanges.check() }
        },
        name as CFString, nil, .deliverImmediately)
    }
    // Siri may have started the timer while the app wasn't running.
    DispatchQueue.main.async {
      if StopwatchStore.load().isRunning { liveActivityNeedsSync = true }
    }
  }

  /// Main queue.
  private static func check() {
    let counter = StopwatchStore.commandCounter
    let changed = lock.withLock { () -> Bool in
      guard counter != seenCounter else { return false }
      seenCounter = counter
      return true
    }
    guard changed else { return }
    NotificationCenter.default.post(name: StopwatchStore.didChangeNotification, object: nil)
    if UIApplication.shared.applicationState == .background {
      liveActivityNeedsSync = true
    } else {
      syncLiveActivity()
    }
  }

  /// Main queue.
  private static func syncLiveActivity() {
    liveActivityNeedsSync = false
    guard #available(iOS 16.2, *) else { return }
    let state = StopwatchStore.load()
    Task {
      if state.isRunning {
        await StopwatchActivityController.startOrUpdate(state)
      } else if state.accumulatedMs > 0 {
        await StopwatchActivityController.update(state)
      } else {
        await StopwatchActivityController.end(finalState: state)
      }
    }
  }
}
