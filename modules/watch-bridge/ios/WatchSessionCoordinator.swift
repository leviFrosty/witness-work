import Foundation
import StopwatchBridge
import UIKit
import WatchConnectivity

/// Durable iPhone-side state of the watch connection, stored as JSON in
/// Application Support. Also holds what Siri on the iPhone made, taken from
/// `IntentInbox`.
struct WatchInbox: Codable {
  struct PendingEntry: Codable {
    let draft: WatchEntryDraft
    let receivedAt: Double
  }

  struct PendingTrip: Codable {
    let draft: WatchTripDraft
    let receivedAt: Double
  }

  struct Event: Codable {
    let name: String
    let properties: [String: String]
  }

  /// Entries waiting for JS to save them as Time Entries.
  var pending: [PendingEntry] = []
  /// Trips waiting for JS to save them.
  var pendingTrips: [PendingTrip] = []
  /// Entry and trip ids JS finished with, oldest first.
  var resolvedEntryIds: [String] = []
  /// Timer requests already applied, so a retried request is applied once.
  var handledRequestIds: [String] = []
  /// Analytics events for JS to capture; the watch can't reach analytics.
  var events: [Event] = []
  /// Latest snapshot built by JS, kept so the iPhone can answer the watch
  /// without starting JS.
  var snapshot: WatchSnapshot?
  /// Widget kinds of the complications in use, as the watch last reported.
  var complications: [String]?

  init() {}

  /// Fields added later are missing from older files.
  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    pending = try container.decodeIfPresent([PendingEntry].self, forKey: .pending) ?? []
    pendingTrips = try container.decodeIfPresent([PendingTrip].self, forKey: .pendingTrips) ?? []
    resolvedEntryIds = try container.decodeIfPresent([String].self, forKey: .resolvedEntryIds) ?? []
    handledRequestIds =
      try container.decodeIfPresent([String].self, forKey: .handledRequestIds) ?? []
    events = try container.decodeIfPresent([Event].self, forKey: .events) ?? []
    snapshot = try container.decodeIfPresent(WatchSnapshot.self, forKey: .snapshot)
    complications = try container.decodeIfPresent([String].self, forKey: .complications)
  }
}

/// Owns the iPhone side of WatchConnectivity for the life of the process.
///
/// Activated from `WatchBridgeAppDelegateSubscriber` at launch, before JS
/// loads, so deliveries that wake the app aren't dropped. Requests are handled
/// natively: timer commands run against `StopwatchStore`, and new entries and
/// trips are stored in the inbox until JS saves them
/// (`src/app/watch/watchSync.ts`). Entries and trips Siri made on the iPhone
/// join the same inbox from `IntentInbox`, so this also runs on an iPad, which
/// has no watch connection.
final class WatchSessionCoordinator: NSObject, WCSessionDelegate {
  static let shared = WatchSessionCoordinator()

  /// Posted on the main queue when entries, trips or events arrive for JS.
  static let inboxDidChange = Notification.Name("WatchBridge.inboxDidChange")
  /// Posted on the main queue when activation completes or the paired watch,
  /// its app, or its complications change.
  static let statusDidChange = Notification.Name("WatchBridge.statusDidChange")

  private static let maxResolvedIds = 500
  private static let maxContextResolvedIds = 200
  private static let maxHandledRequestIds = 200
  private static let maxEvents = 100

  private let queue = DispatchQueue(label: "WatchBridge.coordinator")
  // Everything below is only touched on `queue`, except `backgroundTask`
  // (main queue).
  private var inbox = WatchInbox()
  /// False until the inbox file was read, or found missing. While false (e.g.
  /// storage still locked after a restart) nothing is written, so a stored
  /// inbox is never overwritten with an empty one.
  private var loaded = false
  private var activated = false
  private var lastComplicationSignature: Data?
  private var stopwatchObserver: NSObjectProtocol?
  private var backgroundTask: UIBackgroundTaskIdentifier = .invalid

  func activate() {
    let alreadyActivated = queue.sync { () -> Bool in
      defer { activated = true }
      loadIfNeeded()
      if !activated { importIntentInbox(notify: false) }
      return activated
    }
    guard !alreadyActivated else { return }

    observeIntentInbox()
    // Siri on the iPhone changes the timer from another process; this reposts
    // that change here, for the watch and JS.
    StopwatchExternalChanges.start()
    guard WCSession.isSupported() else { return }
    stopwatchObserver = NotificationCenter.default.addObserver(
      forName: StopwatchStore.didChangeNotification, object: nil, queue: nil
    ) { [weak self] _ in
      self?.queue.async { self?.publish() }
    }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  // MARK: JS API

  func setSnapshot(_ json: String) throws {
    let snapshot = try JSONDecoder().decode(WatchSnapshot.self, from: Data(json.utf8))
    queue.async {
      // The Siri extension reads it from the App Group.
      IntentInbox.saveSnapshot(snapshot)
      self.loadIfNeeded()
      guard self.loaded else { return }
      self.inbox.snapshot = snapshot
      self.persist()
      self.publish()
    }
  }

  func pendingEntries() -> [WatchEntryDraft] {
    queue.sync {
      loadIfNeeded()
      importIntentInbox(notify: false)
      return inbox.pending.map(\.draft)
    }
  }

  func pendingTrips() -> [WatchTripDraft] {
    queue.sync {
      loadIfNeeded()
      importIntentInbox(notify: false)
      return inbox.pendingTrips.map(\.draft)
    }
  }

  /// JS saved or refused these entries or trips; the watch stops showing them
  /// as syncing once it receives the next context.
  func resolveEntries(_ ids: [String]) {
    queue.async {
      guard self.loaded else { return }
      let resolved = Set(ids)
      self.inbox.pending.removeAll { resolved.contains($0.draft.id) }
      self.inbox.pendingTrips.removeAll { resolved.contains($0.draft.id) }
      for id in ids where !self.inbox.resolvedEntryIds.contains(id) {
        self.inbox.resolvedEntryIds.append(id)
      }
      self.inbox.resolvedEntryIds = Array(self.inbox.resolvedEntryIds.suffix(Self.maxResolvedIds))
      self.persist()
      self.publish()
      if self.inbox.pending.isEmpty, self.inbox.pendingTrips.isEmpty {
        DispatchQueue.main.async { self.endBackgroundTask() }
      }
    }
  }

  func activeComplications() -> [String]? {
    queue.sync {
      loadIfNeeded()
      return inbox.complications
    }
  }

  func takeEvents() -> [WatchInbox.Event] {
    queue.sync {
      importIntentInbox(notify: false)
      guard loaded, !inbox.events.isEmpty else { return [] }
      let events = inbox.events
      inbox.events = []
      persist()
      return events
    }
  }

  // MARK: Requests

  private func process(_ message: [String: Any]) -> WatchReply {
    guard let request = WatchProtocol.decode(WatchRequest.self, from: message) else {
      return WatchReply(status: .rejected, reason: .invalid, context: nil)
    }
    loadIfNeeded()
    guard loaded else {
      return WatchReply(status: .rejected, reason: .unavailable, context: nil)
    }
    guard request.protocolVersion <= WatchProtocol.version else {
      return WatchReply(status: .rejected, reason: .unsupportedVersion, context: makeContext())
    }

    switch request.kind {
    case .hello:
      if let complications = request.complications, complications != inbox.complications {
        inbox.complications = complications
        persist()
      }
      return WatchReply(status: .accepted, context: makeContext())

    case .addEntry:
      guard let entry = request.entry, entry.id == request.id else { return invalid() }
      let isNew = !isKnownEntry(entry.id)
      let reply = accept(entry)
      if isNew, reply.status == .accepted {
        recordSiriAction("add_time", request)
        persist()
      }
      return reply

    case .timer:
      guard let action = request.timerAction else { return invalid() }
      if !inbox.handledRequestIds.contains(request.id) {
        // Commands set a state rather than toggle, so one that crossed a change
        // made on the iPhone still leaves the timer as the user asked.
        let next = action == .start ? StopwatchStore.start() : StopwatchStore.pause()
        updateLiveActivity(next, ending: false)
        markHandled(request.id)
        recordEvent(
          "watch_timer_action_completed",
          ["action": action == .start ? "started" : "paused",
           "origin": (request.origin ?? .app).rawValue])
        recordSiriAction(action == .start ? "start_timer" : "pause_timer", request)
        persist()
      }
      return WatchReply(status: .accepted, context: makeContext())

    case .stopTimer:
      guard let template = request.entry, template.id == request.id else { return invalid() }
      if isKnownEntry(template.id) {
        return WatchReply(status: .accepted, context: makeContext())
      }
      let paused = StopwatchStore.pause()
      let minutes = WatchEntryDraft.timerMinutes(elapsedMs: paused.accumulatedMs)
      guard minutes < WatchEntryDraft.minutesRange.upperBound else {
        updateLiveActivity(paused, ending: false)
        return WatchReply(status: .rejected, reason: .timerTooLong, context: makeContext())
      }
      guard minutes >= WatchEntryDraft.minutesRange.lowerBound else {
        updateLiveActivity(paused, ending: false)
        return WatchReply(status: .rejected, reason: .timerEmpty, context: makeContext())
      }
      let entry = WatchEntryDraft(
        id: template.id, date: template.date, hours: minutes / 60, minutes: minutes % 60,
        categoryId: template.categoryId, origin: template.origin)
      let reply = accept(entry)
      guard reply.status == .accepted else { return reply }
      let reset = StopwatchStore.reset()
      updateLiveActivity(reset, ending: true)
      recordSiriAction("stop_timer", request)
      persist()
      return WatchReply(status: .accepted, context: makeContext())

    case .addTrip:
      guard let trip = request.trip, trip.id == request.id else { return invalid() }
      if !isKnownEntry(trip.id) {
        inbox.pendingTrips.append(.init(draft: trip, receivedAt: Date().timeIntervalSince1970))
        guard persist() else {
          inbox.pendingTrips.removeLast()
          return WatchReply(status: .rejected, reason: .unavailable, context: nil)
        }
        recordSiriAction("log_trip", request)
        persist()
        notifyJS(needsBackgroundTime: true)
      }
      return WatchReply(status: .accepted, context: makeContext())

    case .saveTimer:
      guard let entry = request.entry, entry.id == request.id,
            let expected = request.expectedTimerRevision
      else { return invalid() }
      if isKnownEntry(entry.id) {
        return WatchReply(status: .accepted, context: makeContext())
      }
      // The watch shows the time it saves; if the timer changed since, that
      // time is out of date and resetting would discard the difference.
      guard StopwatchStore.commandCounter == expected else {
        return WatchReply(status: .rejected, reason: .timerChanged, context: makeContext())
      }
      let reply = accept(entry)
      guard reply.status == .accepted else { return reply }
      let reset = StopwatchStore.reset()
      updateLiveActivity(reset, ending: true)
      return WatchReply(status: .accepted, context: makeContext())
    }
  }

  private func accept(_ entry: WatchEntryDraft) -> WatchReply {
    if !isKnownEntry(entry.id) {
      inbox.pending.append(.init(draft: entry, receivedAt: Date().timeIntervalSince1970))
      guard persist() else {
        inbox.pending.removeLast()
        return WatchReply(status: .rejected, reason: .unavailable, context: nil)
      }
      notifyJS(needsBackgroundTime: true)
    }
    return WatchReply(status: .accepted, context: makeContext())
  }

  private func invalid() -> WatchReply {
    WatchReply(status: .rejected, reason: .invalid, context: makeContext())
  }

  /// An entry or trip with this id is waiting or was already handled.
  private func isKnownEntry(_ id: String) -> Bool {
    inbox.pending.contains { $0.draft.id == id }
      || inbox.pendingTrips.contains { $0.draft.id == id }
      || inbox.resolvedEntryIds.contains(id)
  }

  private func markHandled(_ id: String) {
    inbox.handledRequestIds.append(id)
    inbox.handledRequestIds = Array(inbox.handledRequestIds.suffix(Self.maxHandledRequestIds))
  }

  private func recordEvent(_ name: String, _ properties: [String: String]) {
    inbox.events.append(.init(name: name, properties: properties))
    inbox.events = Array(inbox.events.suffix(Self.maxEvents))
    notifyJS(needsBackgroundTime: false)
  }

  /// Siri and Shortcuts on the watch; the iPhone extension records its own.
  private func recordSiriAction(_ action: String, _ request: WatchRequest) {
    guard request.origin == .shortcut else { return }
    recordEvent("siri_action_completed", ["action": action, "device": "watch"])
  }

  /// Mirrors the stopwatch module's commands. Starting a Live Activity fails
  /// while the app is in the background; the timer itself still runs.
  private func updateLiveActivity(
    _ state: StopwatchAttributes.ContentState, ending: Bool
  ) {
    guard #available(iOS 16.2, *) else { return }
    Task {
      if ending {
        await StopwatchActivityController.end(finalState: state)
      } else if state.isRunning {
        await StopwatchActivityController.startOrUpdate(state)
      } else {
        await StopwatchActivityController.update(state)
      }
    }
  }

  // MARK: Publishing

  private func makeContext() -> PhoneContext {
    let state = StopwatchStore.load()
    return PhoneContext(
      sentAt: Date().timeIntervalSince1970,
      snapshot: inbox.snapshot,
      timer: TimerSnapshot(
        isRunning: state.isRunning,
        startedAt: state.startedAt,
        accumulatedMs: state.accumulatedMs,
        revision: StopwatchStore.commandCounter),
      resolvedEntryIds: Array(inbox.resolvedEntryIds.suffix(Self.maxContextResolvedIds)))
  }

  private func publish() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.activationState == .activated, session.isPaired,
          session.isWatchAppInstalled
    else { return }
    loadIfNeeded()
    guard loaded else { return }
    let context = makeContext()
    guard let payload = try? WatchProtocol.encode(context) else { return }
    try? session.updateApplicationContext(payload)

    // Complications refresh on a daily budget; spend it only when what they
    // show changed. JS sends a snapshot only when its content changed, unless
    // forced.
    guard session.isComplicationEnabled, let snapshot = context.snapshot else { return }
    let signature = Self.contentSignature(snapshot)
    if signature != lastComplicationSignature,
       session.remainingComplicationUserInfoTransfers > 0 {
      session.transferCurrentComplicationUserInfo(payload)
      lastComplicationSignature = signature
    }
  }

  /// Everything in `snapshot` except when it was built.
  private static func contentSignature(_ snapshot: WatchSnapshot) -> Data? {
    guard let data = try? JSONEncoder().encode(snapshot),
          var object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return nil }
    object["generatedAt"] = nil
    return try? JSONSerialization.data(withJSONObject: object, options: .sortedKeys)
  }

  // MARK: Siri on the iPhone

  /// Moves what the Siri extension left in `IntentInbox` into this inbox.
  private func importIntentInbox(notify: Bool) {
    guard loaded else { return }
    var imported = false
    IntentInbox.drain { contents in
      let previous = inbox
      let now = Date().timeIntervalSince1970
      for entry in contents.entries where !isKnownEntry(entry.id) {
        inbox.pending.append(.init(draft: entry, receivedAt: now))
      }
      for trip in contents.trips where !isKnownEntry(trip.id) {
        inbox.pendingTrips.append(.init(draft: trip, receivedAt: now))
      }
      inbox.events += contents.events.map { .init(name: $0.name, properties: $0.properties) }
      inbox.events = Array(inbox.events.suffix(Self.maxEvents))
      imported = persist()
      if !imported { inbox = previous }
      return imported
    }
    if imported, notify {
      notifyJS(needsBackgroundTime: false)
    }
  }

  /// The extension posts this while the app may be running, e.g. Siri over
  /// the open app.
  private func observeIntentInbox() {
    guard let name = IntentInbox.didChangeNotificationName else { return }
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(), nil,
      { _, _, _, _, _ in
        let coordinator = WatchSessionCoordinator.shared
        coordinator.queue.async {
          coordinator.loadIfNeeded()
          coordinator.importIntentInbox(notify: true)
        }
      },
      name as CFString, nil, .deliverImmediately)
  }

  // MARK: Storage

  private static var fileURL: URL? {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)
      .first?
      .appendingPathComponent("WatchBridge", isDirectory: true)
      .appendingPathComponent("inbox.json")
  }

  private func loadIfNeeded() {
    guard !loaded, let url = Self.fileURL else { return }
    guard FileManager.default.fileExists(atPath: url.path) else {
      loaded = true
      return
    }
    guard let data = try? Data(contentsOf: url) else { return }
    inbox = (try? JSONDecoder().decode(WatchInbox.self, from: data)) ?? WatchInbox()
    loaded = true
  }

  @discardableResult
  private func persist() -> Bool {
    guard loaded, let url = Self.fileURL else { return false }
    do {
      try FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try JSONEncoder().encode(inbox).write(
        to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
      return true
    } catch {
      return false
    }
  }

  // MARK: JS wake-up

  /// For new entries, also asks for background time so JS, resumed by this
  /// delivery, can save them before the app is suspended again. The time ends
  /// when JS resolves the last pending entry.
  private func notifyJS(needsBackgroundTime: Bool) {
    DispatchQueue.main.async {
      if needsBackgroundTime, self.backgroundTask == .invalid {
        self.backgroundTask = UIApplication.shared.beginBackgroundTask(
          withName: "WatchBridge.saveEntries"
        ) {
          self.endBackgroundTask()
        }
      }
      NotificationCenter.default.post(name: Self.inboxDidChange, object: nil)
    }
  }

  private func endBackgroundTask() {
    guard backgroundTask != .invalid else { return }
    UIApplication.shared.endBackgroundTask(backgroundTask)
    backgroundTask = .invalid
  }

  // MARK: WCSessionDelegate

  func session(
    _ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    queue.async { self.publish() }
    postStatusChange()
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  /// The user switched to another paired watch; reactivate to talk to it.
  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }

  func sessionWatchStateDidChange(_ session: WCSession) {
    queue.async { self.publish() }
    postStatusChange()
  }

  private func postStatusChange() {
    DispatchQueue.main.async {
      NotificationCenter.default.post(name: Self.statusDidChange, object: nil)
    }
  }

  func session(
    _ session: WCSession, didReceiveMessage message: [String: Any],
    replyHandler: @escaping ([String: Any]) -> Void
  ) {
    queue.async {
      let reply = self.process(message)
      replyHandler((try? WatchProtocol.encode(reply)) ?? [:])
    }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    queue.async {
      _ = self.process(message)
      self.publish()
    }
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    queue.async {
      _ = self.process(userInfo)
      self.publish()
    }
  }
}
