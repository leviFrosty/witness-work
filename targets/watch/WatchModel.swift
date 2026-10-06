import Foundation
import Observation
import WatchConnectivity
import WidgetKit

/// State behind the watch UI and App Intents.
///
/// Entries and trips are kept in a stored outbox until the iPhone app has
/// saved them: sent as a message when the iPhone is reachable, and as a queued
/// transfer otherwise. Each one's id is its id on the iPhone, so sending it
/// more than once is safe. Timer commands need the iPhone right away and
/// aren't queued. Errors are `ServiceActionError`s (`ServiceIntents.swift`).
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
    await enqueue(WatchRequest(kind: .addEntry, id: entry.id, entry: entry, origin: origin))
  }

  /// Logs a mileage trip for today, delivered like an entry.
  func addTrip(
    vehicleId: String, distanceMiles: Double, roundTrip: Bool, origin: WatchOrigin
  ) async {
    let trip = WatchTripDraft(
      id: UUID().uuidString, date: Self.today(), vehicleId: vehicleId,
      distanceMiles: distanceMiles, roundTrip: roundTrip, origin: origin)
    await enqueue(WatchRequest(kind: .addTrip, id: trip.id, trip: trip, origin: origin))
  }

  private func enqueue(_ request: WatchRequest) async {
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
    guard PhoneSession.shared.isReachable else { throw ServiceActionError.phoneUnreachable }
    let reply: WatchReply
    do {
      reply = try await PhoneSession.shared.send(
        WatchRequest(kind: .timer, timerAction: action, origin: origin))
    } catch {
      throw ServiceActionError.phoneUnreachable
    }
    reply.context.map(PhoneSession.shared.receive)
    guard reply.status == .accepted else { throw ServiceActionError.failed }
  }

  /// Pauses the timer and saves whatever it holds as an entry for today, then
  /// resets it. The iPhone works out the time when it handles the request.
  func stopTimer(categoryId: String?, origin: WatchOrigin) async throws {
    guard PhoneSession.shared.isReachable else { throw ServiceActionError.phoneUnreachable }
    let template = WatchEntryDraft(
      id: UUID().uuidString, date: Self.today(), hours: 0, minutes: 0,
      categoryId: categoryId, origin: origin)
    let request = WatchRequest(kind: .stopTimer, id: template.id, entry: template, origin: origin)
    let reply: WatchReply
    do {
      reply = try await PhoneSession.shared.send(request)
    } catch {
      throw ServiceActionError.phoneUnreachable
    }
    reply.context.map(PhoneSession.shared.receive)
    switch (reply.status, reply.reason) {
    case (.accepted, _):
      outbox.append(OutboxItem(request: request, createdAt: .now, delivered: true))
      WatchStorage.saveOutbox(outbox)
    case (.rejected, .timerEmpty):
      throw ServiceActionError.timerEmpty
    case (.rejected, .timerTooLong):
      throw ServiceActionError.timerTooLong
    case (.rejected, _):
      throw ServiceActionError.failed
    }
  }

  /// Saves the paused timer's time as an entry and resets the timer. The
  /// iPhone refuses if its timer changed since the watch showed it.
  func saveTimer(hours: Int, minutes: Int, categoryId: String?) async throws {
    guard let timer, PhoneSession.shared.isReachable else {
      throw ServiceActionError.phoneUnreachable
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
      throw ServiceActionError.phoneUnreachable
    }
    reply.context.map(PhoneSession.shared.receive)
    switch (reply.status, reply.reason) {
    case (.accepted, _):
      outbox.append(OutboxItem(request: request, createdAt: .now, delivered: true))
      saveOutbox()
    case (.rejected, .timerChanged):
      throw ServiceActionError.timerChanged
    case (.rejected, _):
      throw ServiceActionError.failed
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
    alertKey = (error as? ServiceActionError ?? .failed).key
  }
}
