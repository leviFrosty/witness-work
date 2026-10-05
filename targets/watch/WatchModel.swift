import AppIntents
import Foundation
import Observation
import WatchConnectivity
import WidgetKit

/// Why a watch action couldn't finish. Shown in the app and spoken by Siri.
enum WatchActionError: Error, CustomLocalizedStringResourceConvertible {
  case notSetUp
  case hoursLoggingOff
  case invalidDuration
  case phoneUnreachable
  case timerChanged
  case failed

  var key: String {
    switch self {
    case .notSetUp: "watchSetUp"
    case .hoursLoggingOff: "watchHoursLoggingOff"
    case .invalidDuration: "watchInvalidDuration"
    case .phoneUnreachable: "watchPhoneUnreachable"
    case .timerChanged: "watchTimerChanged"
    case .failed: "watchRequestFailed"
    }
  }

  var localizedStringResource: LocalizedStringResource {
    LocalizedStringResource(String.LocalizationValue(key))
  }
}

/// State behind the watch UI and App Intents.
///
/// Entries are kept in a stored outbox until the iPhone app has saved them:
/// sent as a message when the iPhone is reachable, and as a queued transfer
/// otherwise. Each entry's id is its Time Entry id on the iPhone, so sending
/// it more than once is safe. Timer commands need the iPhone right away and
/// aren't queued.
@MainActor
@Observable
final class WatchModel {
  static let shared = WatchModel()

  /// Entries the iPhone app hasn't reported handled within this time are
  /// dropped, e.g. after the iPhone app was removed.
  private static let outboxLifetime: TimeInterval = 30 * 24 * 60 * 60

  private(set) var context: PhoneContext? = WatchStorage.loadContext()
  private(set) var outbox: [OutboxItem] = WatchStorage.loadOutbox()
  private(set) var isReachable = false
  /// Translation key of a message to show, if any.
  var alertKey: String?

  var snapshot: WatchSnapshot? { context?.snapshot }
  var timer: TimerSnapshot? { context?.timer }
  var isSyncing: Bool { !outbox.isEmpty }

  /// The month as the complications show it, with entries still on their way
  /// to the iPhone. `nil` when the snapshot is out of date.
  func progress(at date: Date = .now) -> MonthProgress? {
    guard let context, let snapshot = context.snapshot else { return nil }
    return MonthProgress(
      snapshot: snapshot, outbox: outbox, resolvedEntryIds: context.resolvedEntryIds,
      at: date)
  }

  // MARK: Incoming

  func apply(_ context: PhoneContext) {
    guard context.sentAt >= (self.context?.sentAt ?? 0) else { return }
    self.context = context
    let resolved = Set(context.resolvedEntryIds)
    let cutoff = Date.now.addingTimeInterval(-Self.outboxLifetime)
    let remaining = outbox.filter { !resolved.contains($0.id) && $0.createdAt > cutoff }
    if remaining.count != outbox.count {
      outbox = remaining
      saveOutbox()
    }
  }

  func connectionChanged() {
    isReachable = PhoneSession.shared.isReachable
    if isReachable { Task { await refresh() } }
  }

  /// Asks the iPhone for fresh data and resends anything it hasn't accepted.
  func refresh() async {
    isReachable = PhoneSession.shared.isReachable
    guard isReachable else { return }
    let hello = WatchRequest(kind: .hello, complications: await Self.complicationKinds())
    if let reply = try? await PhoneSession.shared.send(hello) {
      reply.context.map(PhoneSession.shared.receive)
    }
    for item in outbox where !item.delivered {
      guard PhoneSession.shared.isReachable,
            let reply = try? await PhoneSession.shared.send(item.request)
      else { return }
      handle(reply, for: item.id)
    }
  }

  // MARK: Entries

  /// Adds a Time Entry for today. Returns once it's stored and handed to the
  /// connection; the iPhone app saves it when it next runs.
  func addEntry(hours: Int, minutes: Int, categoryId: String?, origin: WatchOrigin) async {
    let entry = WatchEntryDraft(
      id: UUID().uuidString, date: Self.today(), hours: hours, minutes: minutes,
      categoryId: categoryId, origin: origin)
    let request = WatchRequest(kind: .addEntry, id: entry.id, entry: entry, origin: origin)
    outbox.append(OutboxItem(request: request, createdAt: .now, delivered: false))
    saveOutbox()

    if PhoneSession.shared.isReachable,
       let reply = try? await PhoneSession.shared.send(request) {
      handle(reply, for: request.id)
      // Only a temporarily unavailable iPhone is worth queuing for later.
      if reply.reason != .unavailable { return }
    }
    PhoneSession.shared.transfer(request)
  }

  private func handle(_ reply: WatchReply, for id: String) {
    reply.context.map(PhoneSession.shared.receive)
    guard let index = outbox.firstIndex(where: { $0.id == id }) else { return }
    switch (reply.status, reply.reason) {
    case (.accepted, _):
      outbox[index].delivered = true
    case (.rejected, .unavailable):
      return  // The iPhone is locked after a restart; try again later.
    case (.rejected, _):
      outbox.remove(at: index)
    }
    saveOutbox()
  }

  // MARK: Timer

  func setTimer(_ action: WatchTimerAction, origin: WatchOrigin) async throws {
    guard PhoneSession.shared.isReachable else { throw WatchActionError.phoneUnreachable }
    let reply: WatchReply
    do {
      reply = try await PhoneSession.shared.send(
        WatchRequest(kind: .timer, timerAction: action, origin: origin))
    } catch {
      throw WatchActionError.phoneUnreachable
    }
    reply.context.map(PhoneSession.shared.receive)
    guard reply.status == .accepted else { throw WatchActionError.failed }
  }

  /// Saves the paused timer's time as an entry and resets the timer. The
  /// iPhone refuses if its timer changed since the watch showed it.
  func saveTimer(hours: Int, minutes: Int, categoryId: String?) async throws {
    guard let timer, PhoneSession.shared.isReachable else {
      throw WatchActionError.phoneUnreachable
    }
    let entry = WatchEntryDraft(
      id: UUID().uuidString, date: Self.today(), hours: hours, minutes: minutes,
      categoryId: categoryId, origin: .timer)
    let request = WatchRequest(
      kind: .saveTimer, id: entry.id, entry: entry,
      expectedTimerRevision: timer.revision, origin: .timer)
    let reply: WatchReply
    do {
      reply = try await PhoneSession.shared.send(request)
    } catch {
      throw WatchActionError.phoneUnreachable
    }
    reply.context.map(PhoneSession.shared.receive)
    switch (reply.status, reply.reason) {
    case (.accepted, _):
      outbox.append(OutboxItem(request: request, createdAt: .now, delivered: true))
      saveOutbox()
    case (.rejected, .timerChanged):
      throw WatchActionError.timerChanged
    case (.rejected, _):
      throw WatchActionError.failed
    }
  }

  // MARK: Helpers

  /// Complications add unsynced entries to the month's total, so they follow
  /// the outbox.
  private func saveOutbox() {
    WatchStorage.saveOutbox(outbox)
    WidgetCenter.shared.reloadAllTimelines()
  }

  /// Widget kinds of the complications in use, for the iPhone's analytics.
  private static func complicationKinds() async -> [String]? {
    guard let configurations = try? await WidgetCenter.shared.currentConfigurations() else {
      return nil
    }
    return Set(configurations.map(\.kind)).sorted()
  }

  /// Today on the watch as Gregorian `YYYY-MM-DD`, whatever calendar the user
  /// has chosen.
  static func today(_ date: Date = .now) -> String {
    WatchSnapshot.dayKey(for: date)
  }

  func show(_ error: Error) {
    alertKey = (error as? WatchActionError ?? .failed).key
  }
}
