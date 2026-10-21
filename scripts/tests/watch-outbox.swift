import Foundation

/// What the Apple Watch does with the iPhone's reply to an entry, as
/// `OutboxDeliveryTest.kt` checks on Wear OS. Run by
/// `scripts/tests/watch-outbox.node.mjs` (`pnpm test:watch-native`).
@main struct WatchOutboxTests {
  static func main() {
    func delivery(_ status: WatchReply.Status, _ reason: WatchReply.Reason? = nil) -> OutboxDelivery {
      OutboxDelivery(WatchReply(status: status, reason: reason, context: nil))
    }
    func expect(_ actual: OutboxDelivery, _ expected: OutboxDelivery, _ message: String) {
      precondition(actual == expected, "\(message): \(actual) != \(expected)")
    }

    expect(delivery(.accepted), .accepted, "accepted")
    expect(delivery(.rejected, .unavailable), .retry, "iPhone locked after a restart")
    // These used to be dropped from the outbox while Add Time played its
    // success haptic.
    expect(
      delivery(.rejected, .unsupportedVersion), .refused(.unsupportedVersion),
      "older iPhone app")
    expect(delivery(.rejected, .invalid), .refused(.invalid), "invalid request")
  }
}
