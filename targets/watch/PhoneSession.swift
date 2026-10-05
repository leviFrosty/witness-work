import Foundation
import WatchConnectivity
import WatchKit
import WidgetKit

enum PhoneSessionError: Error {
  case badReply
}

/// The watch side of WatchConnectivity. The iPhone is the source of truth;
/// everything it publishes is stored before the UI and complications update.
final class PhoneSession: NSObject, WCSessionDelegate, @unchecked Sendable {
  static let shared = PhoneSession()

  private let lock = NSLock()
  private var backgroundTasks: [WKWatchConnectivityRefreshBackgroundTask] = []

  /// Idempotent. Also called from App Intents, which can run before any UI.
  func activate() {
    let session = WCSession.default
    if session.delegate == nil { session.delegate = self }
    if session.activationState == .notActivated { session.activate() }
  }

  func waitUntilActivated(timeout: Duration = .seconds(5)) async {
    activate()
    let deadline = ContinuousClock.now + timeout
    while WCSession.default.activationState != .activated, ContinuousClock.now < deadline {
      try? await Task.sleep(for: .milliseconds(100))
    }
  }

  /// The iPhone is in range; a message wakes the iPhone app if needed.
  var isReachable: Bool {
    WCSession.default.activationState == .activated && WCSession.default.isReachable
  }

  func send(_ request: WatchRequest) async throws -> WatchReply {
    let payload = try WatchProtocol.encode(request)
    return try await withCheckedThrowingContinuation { continuation in
      WCSession.default.sendMessage(
        payload,
        replyHandler: { reply in
          if let decoded = WatchProtocol.decode(WatchReply.self, from: reply) {
            continuation.resume(returning: decoded)
          } else {
            continuation.resume(throwing: PhoneSessionError.badReply)
          }
        },
        errorHandler: { continuation.resume(throwing: $0) })
    }
  }

  /// Queues `request` for delivery whenever the iPhone is next available,
  /// even if this app isn't running then.
  func transfer(_ request: WatchRequest) {
    guard WCSession.default.activationState == .activated,
          let payload = try? WatchProtocol.encode(request)
    else { return }
    WCSession.default.transferUserInfo(payload)
  }

  /// Keeps the task until pending deliveries are stored, as WatchKit expects.
  func handle(_ task: WKWatchConnectivityRefreshBackgroundTask) {
    lock.withLock { backgroundTasks.append(task) }
    activate()
    completeBackgroundTasksIfIdle()
  }

  private func completeBackgroundTasksIfIdle() {
    let session = WCSession.default
    guard session.activationState == .activated, !session.hasContentPending else { return }
    let tasks = lock.withLock {
      defer { backgroundTasks = [] }
      return backgroundTasks
    }
    tasks.forEach { $0.setTaskCompletedWithSnapshot(false) }
  }

  /// Stores a context from the iPhone and refreshes everything that shows it.
  func receive(_ context: PhoneContext) {
    let previous = WatchStorage.loadContext()?.snapshot
    guard WatchStorage.saveContextIfNewer(context) else { return }
    if previous != context.snapshot {
      WidgetCenter.shared.reloadAllTimelines()
    }
    Task { @MainActor in WatchModel.shared.apply(context) }
  }

  private func receive(_ dictionary: [String: Any]) {
    if let context = WatchProtocol.decode(PhoneContext.self, from: dictionary) {
      receive(context)
    }
  }

  // MARK: WCSessionDelegate

  func session(
    _ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    receive(session.receivedApplicationContext)
    Task { @MainActor in WatchModel.shared.connectionChanged() }
    completeBackgroundTasksIfIdle()
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    Task { @MainActor in WatchModel.shared.connectionChanged() }
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    receive(applicationContext)
    completeBackgroundTasksIfIdle()
  }

  /// Complication updates from the iPhone arrive as user info.
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    receive(userInfo)
    completeBackgroundTasksIfIdle()
  }
}
