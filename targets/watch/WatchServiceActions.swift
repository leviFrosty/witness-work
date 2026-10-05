import Foundation

/// `ServiceActions` on the watch: everything goes to the iPhone through
/// `WatchModel`. Each intent waits for the connection to activate first, since
/// it can run before any UI.
@MainActor
enum ServiceActions {
  static func snapshot() async -> WatchSnapshot? {
    await PhoneSession.shared.waitUntilActivated()
    return WatchModel.shared.snapshot
  }

  nonisolated static func storedSnapshot() -> WatchSnapshot? {
    WatchStorage.loadContext()?.snapshot
  }

  static func addEntry(minutes: Int, categoryId: String?) async throws {
    await WatchModel.shared.addEntry(
      hours: minutes / 60, minutes: minutes % 60, categoryId: categoryId, origin: .shortcut)
  }

  static func setTimer(_ action: WatchTimerAction) async throws {
    try await WatchModel.shared.setTimer(action, origin: .shortcut)
  }

  static func stopTimer(categoryId: String?) async throws {
    try await WatchModel.shared.stopTimer(categoryId: categoryId, origin: .shortcut)
  }

  static func addTrip(vehicleId: String, distanceMiles: Double, roundTrip: Bool) async throws {
    await WatchModel.shared.addTrip(
      vehicleId: vehicleId, distanceMiles: distanceMiles, roundTrip: roundTrip,
      origin: .shortcut)
  }

  /// The watch has no analytics; the iPhone records the requests it receives.
  static func record(_ action: ServiceAction, error: ServiceActionError?) {}
}
