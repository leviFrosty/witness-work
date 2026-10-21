import Foundation

/// Which outbox items the Apple Watch queues for the iPhone again. Run by
/// `scripts/tests/watch-outbox-resend.node.mjs` (`pnpm test:watch-native`).
@main struct WatchOutboxResendTests {
  static func main() {
    func item(_ id: String, delivered: Bool) -> OutboxItem {
      let entry = WatchEntryDraft(
        id: id, date: "2026-10-05", hours: 1, minutes: 30, categoryId: nil, origin: .app)
      return OutboxItem(
        request: WatchRequest(kind: .addEntry, id: id, entry: entry, origin: .app),
        createdAt: Date(), delivered: delivered)
    }
    func ids(_ items: [OutboxItem]) -> [String] { items.map(\.id) }

    let outbox = [
      // Accepted; only waits for the iPhone app to save it.
      item("accepted", delivered: true),
      // Its transfer reached an iPhone locked after a restart, which couldn't
      // store it; it used to wait until the watch app was open with the iPhone
      // in reach.
      item("used-up", delivered: false),
      // Still on its way.
      item("in-flight", delivered: false),
    ]
    let resent = ids(OutboxItem.toResend(outbox, waiting: ["in-flight"]))
    precondition(resent == ["used-up"], "resent \(resent)")
    precondition(OutboxItem.toResend([], waiting: []).isEmpty, "empty outbox")
  }
}
