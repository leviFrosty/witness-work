import Foundation

/// Source-of-truth persistence + mutation helpers for the stopwatch state.
///
/// Shared between the main app (expo module), the widget extension (Live
/// Activity buttons) and the Siri extension (`targets/intents`). State is
/// stored in App Group `UserDefaults` (see `AppGroup`) so all processes read
/// the same value.
@available(iOS 16.1, *)
public enum StopwatchStore {
  private static let stateKey = "stopwatch.state.v1"
  private static let commandCounterKey = "stopwatch.commandCounter.v1"

  /// Posted in the saving process after every state change, so observers in
  /// that process (the JS event emitter, the watch connection) react at once.
  /// Other processes notice through `commandCounter`, and while running through
  /// `changedElsewhereNotificationName` (see `StopwatchExternalChanges`).
  public static let didChangeNotification = Notification.Name("StopwatchStore.didChange")

  /// Darwin notification posted after every state change, across processes.
  /// Includes the App Group so app variants don't hear each other.
  public static var changedElsewhereNotificationName: String? {
    AppGroup.identifier.map { "\($0).stopwatch.didChange" }
  }

  // MARK: App Group

  public static func defaults() -> UserDefaults? {
    guard let group = AppGroup.identifier else { return nil }
    return UserDefaults(suiteName: group)
  }

  // MARK: State I/O

  public static func load() -> StopwatchAttributes.ContentState {
    guard
      let defaults = defaults(),
      let data = defaults.data(forKey: stateKey),
      let state = try? JSONDecoder().decode(
        StopwatchAttributes.ContentState.self, from: data)
    else {
      return .zero
    }
    return state
  }

  @discardableResult
  public static func save(_ state: StopwatchAttributes.ContentState) -> Bool {
    guard let defaults = defaults(),
          let data = try? JSONEncoder().encode(state)
    else { return false }
    defaults.set(data, forKey: stateKey)
    bumpCommandCounter()
    NotificationCenter.default.post(name: didChangeNotification, object: nil)
    if let name = changedElsewhereNotificationName {
      CFNotificationCenterPostNotification(
        CFNotificationCenterGetDarwinNotifyCenter(), CFNotificationName(name as CFString),
        nil, nil, true)
    }
    return true
  }

  /// Incremented on every state mutation so observers (the expo module's
  /// event emitter, or a Darwin notification fan-out) can detect changes.
  private static func bumpCommandCounter() {
    guard let defaults = defaults() else { return }
    let next = defaults.integer(forKey: commandCounterKey) &+ 1
    defaults.set(next, forKey: commandCounterKey)
  }

  public static var commandCounter: Int {
    defaults()?.integer(forKey: commandCounterKey) ?? 0
  }

  // MARK: Mutations (pure; no ActivityKit side effects)

  public static func start(now: Date = Date()) -> StopwatchAttributes.ContentState {
    let current = load()
    // Idempotent: starting while running is a no-op.
    guard !current.isRunning else { return current }
    let next = StopwatchAttributes.ContentState(
      startedAt: now.timeIntervalSince1970,
      accumulatedMs: current.accumulatedMs,
      isRunning: true,
      updatedAt: now.timeIntervalSince1970
    )
    save(next)
    return next
  }

  public static func pause(now: Date = Date()) -> StopwatchAttributes.ContentState {
    let current = load()
    guard current.isRunning, let startedAt = current.startedAt else { return current }
    let segmentMs = max(0, (now.timeIntervalSince1970 - startedAt) * 1000)
    let next = StopwatchAttributes.ContentState(
      startedAt: nil,
      accumulatedMs: current.accumulatedMs + segmentMs,
      isRunning: false,
      updatedAt: now.timeIntervalSince1970
    )
    save(next)
    return next
  }

  /// Stop = pause + end-of-activity. State mutation is identical to pause.
  public static func stop(now: Date = Date()) -> StopwatchAttributes.ContentState {
    return pause(now: now)
  }

  public static func reset(now: Date = Date()) -> StopwatchAttributes.ContentState {
    let next = StopwatchAttributes.ContentState.zero.withUpdatedAt(now.timeIntervalSince1970)
    save(next)
    return next
  }
}

@available(iOS 16.1, *)
extension StopwatchAttributes.ContentState {
  static var zero: Self {
    .init(startedAt: nil, accumulatedMs: 0, isRunning: false, updatedAt: 0)
  }

  func withUpdatedAt(_ ts: Double) -> Self {
    .init(
      startedAt: startedAt,
      accumulatedMs: accumulatedMs,
      isRunning: isRunning,
      updatedAt: ts
    )
  }
}
